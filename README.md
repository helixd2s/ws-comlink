# JS WebSocket Intercom

The main task was to implement objects and classes, as well as method calls, over a remote websocket connection. This library is designed to solve this applied problem. It was originally created for the new game ch2048s, to implement the internal interface of the game. Or rather, libraries for the game, for its core. 

## Features

- Automatic arguments conversation and type-detection
- Custom protocol for remote control
- Conflict-less and bidirectional conversation 
- Using classes, constructors, functions, properties
- Encoding and decoding argument system
- Connection wrapper

## Install

`npm install https://github.com/helixd2s/ws-comlink.git`

## Usage

### Server

```js
import WSComlink from "ws-comlink";
import {WebSocketServer} from 'ws';

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
    wss.on('connection', function connection(ws) {
        let transmitter = new WSComlink(ws);
        let job = new Job();
        
        // add class into registry
        transmitter.register("Job", Job);
    });

    wss.on('close', ()=>{
        wss.close();
    });
})();
```

### Client

```js
//import WebSocketWrapper from 'ws-wrapper'; // if you used in browser
import WebSocket from 'ws';

(async()=>{
    const ws = new WebSocket('ws://127.0.0.1:8000/');
    ws.on("open", ()=>{

        function callback(a) {
            console.log("Called with: " + a);
        }

        let receiver = new WSComlink(ws);
        receiver.on("register", async (changes)=>{
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

                // IDK
                ws.close();
            };
        });

    });
})();

```
