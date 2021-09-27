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

function getAllSetterAndGetters(toCheck) {
  let list = [];
  let obj = toCheck;
  do {
    let names = Object.getOwnPropertyNames(obj);
    list.push(...names.map((name)=>{
      return {
        name: name,
        descriptor: Object.getOwnPropertyDescriptor(obj, name)
      }
    } ));
  } while (obj = Object.getPrototypeOf(obj));

  list = list.sort((a, b)=>{
    return ((a.name < b.name) ? -1 : ((a.name == b.name) ? 0 : 1));
  }).filter((e, i, arr) => {
    let descriptor = e.descriptor;
    if (e.name!=(arr[i+1]?arr[i+1].name:"") && (descriptor.get || descriptor.set)) return true;
  });

  return list.map((p)=>{return p.name;});
}

class WSComlinkTransmitter {
  constructor(connection) {
    this.connection = connection;
    this.classes = {};
    this.observe();
  }

  decodeArguments(args) {
    return JSON.parse(args);
  }

  send(obj) {
    this.connection.send(JSON.stringify(obj));
  }

  registerClass(name, object) {
    this.classes[name] = object;
    let id = uuid();
    this.send({ id, type: "register", result: {
      className: name
    } });
  }

  observe() {
    this.connection.on("message", async (message, isBinary)=>{
      let json = message.data ? message.data : message.toString('utf8');
      let {type, id, className, methodName, argsRaw} = JSON.parse(json);
      let args = argsRaw ? this.decodeArguments(argsRaw) : null;

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
          result: Object.keys(this.classes[className]).concat(getAllSetterAndGetters(this.classes[className]))
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
    this.watchers = {
      register: []
    };
    this.observe();
  }

  encodeArguments(args) {
    return JSON.stringify(args);
  }

  observe() {
    this.connection.on("message", (message)=>{
      let json = message.data ? message.data : message.toString('utf8');
      let {type, id, result} = JSON.parse(json);
      let callObj = this.calls[id];
      if (type == "result") { callObj.resolve(result); }
      //if (type == "methods") { callObj.resolve({ id, result }); }
      //if (type == "properties") { callObj.resolve({ id, result }); }
      if (type == "register") { this.watchers["register"].forEach((cb)=>{ cb(result); }) };
    });
    this.connection.on("close", (reason, details)=>{
      for (let id in this.calls) {
        let callObj = this.calls[id];
        callObj.reject(reason, details);
        console.error(`
Call uuid ${id}, type ${callObj.type}, className ${callObj.className}, methodName ${callObj.methodName}, with arguments ${callObj.args} was failed.\n
Reason ${reason}\n
Details: ${details}
`);
      }
    });
  }

  on(name, cb) {
    this.watchers[name].push(cb);
  }

  send(obj) {
    let id = uuid();
    this.connection.send(JSON.stringify(Object.assign(obj, { id })));
    this.calls[id] = obj;
    Object.assign(this.calls[id], {
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

  properties(className) {
    return this.send({ type: "properties", className });
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

  async wrapClass(className) {
    let methods = await this.methods(className);
    let properties = await this.properties(className);
    let handler = {
      get: (target, name) => {
        if (target.methods.includes(name)) {
          return (async (...args)=>{
            if (name == "_wait") { return target.last; }
            if (target.last) { await target.last; }
            return (await (target.last = this.call(target.className, name, args)))
          });
        } else
        if (target.properties.includes(name)) {
          return (async()=>{
            if (name == "_wait") { return target.last; }
            if (target.last) { await target.last; }
            return (await (target.last = this.get(target.className, name)));
          })();
        } else {
          return target[name];
        }
      },
      set: async (target, name, value) => {
        if (target.properties.includes(name)) {
          await (target.last = (this.set(target.className, name, value)));
        }
      }
    };
    return new Proxy({ className, methods, properties }, handler);
  }
}

export {WSComlinkReceiver, WSComlinkTransmitter};
