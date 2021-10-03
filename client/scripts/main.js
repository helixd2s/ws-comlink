import WSComlink from "../../index.js";
import WebSocketWrapper from 'ws-wrapper';

// 
(async()=>{
    const ws = new WebSocketWrapper(new WebSocket('ws://127.0.0.1:8000/'));
    ws.on("open", ()=>{

        function callback(a) {
            console.log("Called with: " + a);
        }

        let receiver = new WSComlink(ws);
        receiver.on("register", async (changes)=>{
            if (changes.className == "Job") {
                let Job = receiver.proxy(changes.className);
                let jobs = new Job();
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
