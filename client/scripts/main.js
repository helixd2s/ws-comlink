import {WSComlinkReceiver, WSComlinkTransmitter} from "../../index.js";
import WebSocketWrapper from 'ws-wrapper';

const ws = new WebSocketWrapper(new WebSocket('ws://127.0.0.1:8000/'));

console.log(ws);

ws.on("open", ()=>{

    console.log("opened");

    let receiver = new WSComlinkReceiver(ws);
    receiver.on("register", async (changes)=>{

        let jobs = await receiver.wrapClass(changes.className);
        jobs.work = 1;
        console.log(await jobs.practice);
        console.log(await jobs.work);
        console.log(await jobs.doWork(3));
    });

});
