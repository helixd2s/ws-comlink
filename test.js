import WSComlink from "./index.js";
import {WebSocketServer} from 'ws';

const wss = new WebSocketServer({ port: 8000 });

class Job {
    constructor() {
        this.work = 2;
    }

    get practice() {
        return 2;
    }

    doWork(value) {
        console.log(value);
        return value;
    }
}

wss.on('connection', function connection(ws) {
    let transmitter = new WSComlink(ws);
    let job = new Job();

    transmitter.register("Job", Job);

});
