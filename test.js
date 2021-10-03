import WSComlink from "./index.js";
import WebSocket, {WebSocketServer} from 'ws';

(async()=>{
    class Job {
        constructor() {
            this.work = 2;
        }

        get practice() {
            return 2;
        }

        async doWork(value, callback) {
            // you can call function proxy
            //await callback(this.work);
            return (this.work + value);
        }
    };

    const wss = new WebSocketServer({ port: 8000 });
    wss.on('connection', async function connection(ws) {
        let transmitter = new WSComlink(ws);

        // promise test
        let answer = {};
        let promise = new Promise((res,rej)=>{
            answer.resolve = res;
            answer.reject = rej;
        });
        transmitter.register("answer", answer);

        // wait answer from client
        console.log(await (promise));


        // class test
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

            // answer to promise
            if (changes.className == "answer") {
                let answer = receiver.proxy(changes.className);
                answer.resolve("Got answer for promise");
            }
            
            // test class
            if (changes.className == "Job") {
                // get class constructor
                let Job = receiver.proxy(changes.className);

                // try to construct
                let jobs = new Job();

                // try to set
                jobs.work = 1;

                // try getter
                console.log(await jobs.practice);

                // try to get property
                console.log(await jobs.work);

                // try call function
                console.log(await jobs.doWork(2, callback));

                // try to delete property
                delete jobs.work;
                console.log(await jobs.work);
            };
        });

    });
})();
