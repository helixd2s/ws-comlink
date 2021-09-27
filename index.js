function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function getAllFuncs(toCheck) {
  const props = [];
  let obj = toCheck;
  do {
      props.push(...Object.getOwnPropertyNames(obj));
  } while (obj = Object.getPrototypeOf(obj));
  
  return props.sort().filter((e, i, arr) => { 
     if (e!=arr[i+1] && typeof toCheck[e] == 'function') return true;
  });
}

class WSComlinkTransmitter {
  constructor(connection) {
    this.connection = connection;
    this.classes = {};
  }

  decodeArguments(args) {
    return JSON.parse(args);
  }

  send(obj) {
    this.connection.send(JSON.stringify(obj));
  }

  observe() {
    this.connection.on("message", async (message)=>{
      let {type, id, className, methodName, argsRaw} = JSON.parse(message.utf8Data);
      let args = this.decodeArguments(argsRaw);

      // remote methods
      if (type == "methods") { 
        this.send({
          type: "result", 
          id, 
          className, 
          result: getAllFuncs(this.classes[className]) 
        });
      };

      // 
      if (type == "properties") { 
        this.send({
          type: "result", 
          id, 
          className, 
          result: Object.keys(this.classes[className]) 
        });
      };

      // remote function call
      if (type == "call") { 
        this.send({ 
          type: "result", 
          id, 
          className, 
          methodName, 
          result: await this.classes[className][methodName](...args) 
        });
      };

      // remote getter
      if (type == "get") { 
        this.send({
          type: "result", 
          id, 
          className, 
          methodName, 
          result: await this.classes[className][methodName] 
        });
      };

      // remote setter
      if (type == "set") { 
        this.send({
          type: "result", 
          id, 
          className, 
          methodName, 
          result: (this.classes[className][methodName] = args[0]) 
        });
      };
    });
  }
}

class WSComlinkReceiver {
  constructor(connection) {
    this.connection = connection;
    this.classes = {};
    this.calls = {};
  }

  encodeArguments(args) {
    return JSON.stringify(args);
  }

  observe() {
    this.connection.on("message", (message)=>{
      let {type, id, result} = JSON.parse(message.utf8Data);
      let callObj = this.calls[id];
      if (type == "result") { callObj.resolve({ id, result }); }
      //if (type == "methods") { callObj.resolve({ id, result }); }
      //if (type == "properties") { callObj.resolve({ id, result }); }
    });
    this.connection.on("close", (reason)=>{
      for (let id in this.calls) {
        let callObj = this.calls[id];
        callObj.reject(reason, details);
        console.error(`
Call uuid ${id}, className ${callObj.className}, methodName ${callObj.methodName}, with arguments ${callObj.args} was failed.\n
Reason ${reason}\n
Details: ${details}
`);
      }
    });
  }

  send(obj) {
    let id = uuid();
    this.connection.send(JSON.stringify(Object.assign(obj, { id })));
    this.calls[id] = Object.assign(obj, {
      id, promise: new Promise((resolve, reject)=>{
        this.calls[id].resolve = (...args) => { resolve(...args); delete this.calls[id]; };
        this.calls[id].reject = (...args) => { reject(...args); delete this.calls[id]; };
      })
    });
    return this.calls[id].promise;
  }

  methods(className) {
    return this.send({ type: "methods", className });
  }

  set(className, methodName, value) {
    return this.send({ type: "set", className, methodName, argsRaw: this.encodeArguments([value]) });
  }

  get(className, methodName) {
    return this.send({ type: "get", className, methodName });
  }

  call(className, methodName, args) {
    return this.send({ type: "call", className, methodName, argsRaw: this.encodeArguments(args) });
  }
}
