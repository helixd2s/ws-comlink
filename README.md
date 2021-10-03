# ws-comlink
Comlink for WebSockets (WS library)

### Install

`npm install https://github.com/helixd2s/ws-comlink.git`

### Usage

```js
import WSComlink from "ws-comlink";
import WebSocket, {WebSocketServer} from 'ws';
//import WebSocketWrapper from 'ws-wrapper'; // if you used in browser

(async()=>{
    class Job {
        constructor() {
            this.work = 2;
        }

        get practice() {
            return 2;
        }

        async doWork(value, callback) {
            //await callback(this.work);
            return (this.work + value);
        }
    };

    const wss = new WebSocketServer({ port: 8000 });
    wss.on('connection', function connection(ws) {
        let transmitter = new WSComlink(ws);
        let job = new Job();

        transmitter.register("Job", Job);
    });

    wss.on('close', ()=>{
        wss.close();
    });
})();

(async()=>{
    const ws = new WebSocket('ws://127.0.0.1:8000/');
    ws.on("open", ()=>{

        function callback(a) {
            console.log("Called with: " + a);
        }

        let receiver = new WSComlink(ws);
        receiver.on("register", async (changes)=>{
            if (changes.className == "Job") {
                let Job = receiver.proxy(changes.className);
                let jobs = await new Job();
                jobs.work = 1;
                console.log(await jobs.practice);
                console.log(await jobs.work);
                console.log(await jobs.doWork(2, callback));
                delete jobs.work;
                console.log(await jobs.work);

                ws.close();
            };
        });

    });
})();

```
