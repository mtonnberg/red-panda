// Independent NodeVM invocation adapter. Install before authored code. The one
// per-context binding is lexical (not a Window property), but its random name
// is not a native private slot: code that learns the name can address it.
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import {setImmediate as hostSchedule,clearImmediate as hostCancel} from 'node:timers';

const installed = new WeakMap();
const hostApply = Reflect.apply;

export function createInvocationTrampoline(context) {
  if (!vm.isContext(context)) throw new TypeError('An actual VM context is required');
  if (installed.has(context)) return installed.get(context);
  const binding = `__redpanda_invocation_${randomUUID().replaceAll('-', '')}`;
  const controller = new vm.Script(`'use strict';
    const ${binding} = (() => {
      const apply = Reflect.apply;
      const ErrorConstructor = Error;
      const parents = new WeakMap(), parentGet = WeakMap.prototype.get, parentSet = WeakMap.prototype.set;
      const WeakSetConstructor = WeakSet, seenHas = WeakSet.prototype.has, seenAdd = WeakSet.prototype.add;
      let current = null;
      return Object.freeze({
        enter(frame) { const previous = current; apply(parentSet, parents, [frame, previous]); current = frame; return previous; },
        leave(previous) { current = previous; },
        unwind(frame, previous) {
          const seen = new WeakSetConstructor();
          for (let cursor = current; cursor !== null && cursor !== undefined; cursor = apply(parentGet, parents, [cursor])) {
            if (cursor === frame) { current = previous; return; }
            if (apply(seenHas, seen, [cursor])) return;
            apply(seenAdd, seen, [cursor]);
          }
        },
        run() {
          const frame = current;
          if (frame === null) throw new ErrorConstructor('No owned invocation frame');
          return apply(frame.fn, frame.receiver, frame.args);
        },
        inspect() {
          const frame = current;
          if (frame === null) throw new ErrorConstructor('No owned invocation frame');
          return apply(frame.inspect, undefined, []);
        }
      });
    })();
    ${binding};`, { filename: 'red-panda:invocation-bootstrap' }).runInContext(context);
  const enter = controller.enter, leave = controller.leave, unwind = controller.unwind;
  const invocation = new vm.Script(`${binding}.run()`, { filename: 'red-panda:owned-invocation' });
  const inspection = new vm.Script(`${binding}.inspect()`, { filename: 'red-panda:owned-serialization' });
  const pendingInspections=new Set();let recovery;
  function recover(){recovery=undefined;for(const token of [...pendingInspections].reverse())hostApply(unwind,controller,[token.frame,token.previous]);pendingInspections.clear();}
  let disposed = false;
  const adapter = Object.freeze({
    binding,
    withValue(value, inspect, options) {
      if (disposed) throw new Error('Invocation context is disposed');
      const token={frame:{ fn: () => value, receiver: undefined, args: [], inspect: () => inspect(`${binding}.run()`) },previous:null};
      pendingInspections.add(token);recovery??=hostSchedule(recover);
      token.previous = hostApply(enter, controller, [token.frame]);
      try { return inspection.runInContext(context, options); }
      finally {hostApply(leave,controller,[token.previous]);pendingInspections.delete(token);if(!pendingInspections.size&&recovery!==undefined){hostCancel(recovery);recovery=undefined;}}
    },
    invoke(fn, receiver, args, options) {
      if (disposed) throw new Error('Invocation context is disposed');
      const previous = hostApply(enter, controller, [{ fn, receiver, args }]);
      try { return invocation.runInContext(context, options); }
      finally { hostApply(leave, controller, [previous]); }
    },
    invokeDeclaration(declaration, receiver, args, options) {
      if (disposed) throw new Error('Invocation context is disposed');
      const fn = new vm.Script(`(${declaration}\n)`, { filename: 'red-panda:function-declaration' }).runInContext(context, options);
      return adapter.invoke(fn, receiver, args, options);
    },
    dispose() { disposed = true; },
  });
  installed.set(context, adapter); return adapter;
}

export function invocationBindingFor(context) { return installed.get(context)?.binding; }
