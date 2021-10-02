import WSComlink from "../../index.js";
import WebSocketWrapper from 'ws-wrapper';

const ws = new WebSocketWrapper(new WebSocket('ws://127.0.0.1:8000/'));

ws.on("open", ()=>{

    console.log("opened");

    let receiver = new WSComlink(ws);
    receiver.on("register", async (changes)=>{

        let Job = await receiver.proxy(changes.className);
        let jobs = await (new Job());
        jobs.work = 1;
        console.log(await jobs.practice);
        console.log(await jobs.work);
        console.log(await (await jobs.doWork)(3));

    });

});
