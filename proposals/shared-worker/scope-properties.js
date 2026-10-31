new Promise(resolve=>{const worker=new SharedWorker('/worker.js');worker.port.onmessage=e=>resolve(JSON.stringify(e.data));worker.port.postMessage('props')})
