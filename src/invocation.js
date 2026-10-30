// Independent NodeVM invocation adapter. Install before authored code. The one
// per-context binding is lexical (not a Window property), but its random name
// is not a native private slot: code that learns the name can address it.
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';

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
      let current = null;
      return Object.freeze({
        enter(frame) { const previous = current; current = frame; return previous; },
        leave(previous) { current = previous; },
        run() {
          const frame = current;
          if (frame === null) throw new ErrorConstructor('No owned invocation frame');
          return apply(frame.fn, frame.receiver, frame.args);
        }
      });
    })();
    ${binding};`, { filename: 'red-panda:invocation-bootstrap' }).runInContext(context);
  const enter = controller.enter, leave = controller.leave;
  const invocation = new vm.Script(`${binding}.run()`, { filename: 'red-panda:owned-invocation' });
  let disposed = false;
  const adapter = Object.freeze({
    binding,
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
