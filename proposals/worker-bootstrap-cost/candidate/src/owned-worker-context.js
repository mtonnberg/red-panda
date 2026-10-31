// Captured private Node thread initialization data supplied by the existing
// dedicated/shared runtime producers. No authored VM object selects this role.
import {isMainThread,workerData} from 'node:worker_threads';
export const ownsWorkerRuntime=!isMainThread&&(workerData?.redPandaWorker===true||workerData?.redPandaSharedHost===true);
