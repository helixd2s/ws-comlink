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
     if (e!=arr[i+1] && e != "caller" && e != "callee" && e != "arguments" && typeof toCheck[e] == 'function') return true;
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



class ClassHandler {
  constructor(self) {
    this.self = self;
  }
  get (target, name) {
    let self = this.self;
    if (name == "_last") { return target.last; } else
    if (name == "then") { return target.then && typeof target.then == "function" ? target.then.bind(target) : null; } else
    if (name == "catch") { return target.catch && typeof target.catch == "function" ? target.catch.bind(target) : null; } else
    if (target.methods && target.methods.includes(name)) {
      return (async (...args)=>{
        if (target.last) { await target.last; }
        return (await (target.last = self.call(target.className, name, args)))
      });
    } else
    if (target.properties && target.properties.includes(name)) {
      return (async()=>{
        if (target.last) { await target.last; }
        return (await (target.last = self.get(target.className, name)));
      })();
    } else {
      return target[name];
    }
  }
  async set (target, name, value) {
    let self = this.self;
    if (target.properties.includes(name)) {
      await (target.last = (self.set(target.className, name, value)));
    }
  }
  construct(target, args, newTarget) {
    let self = this.self;
    return new Promise(async (resolve, reject)=>{
      console.warn("we returned a promise to class, please wait it");
      let className = await self.construct(target.className, args);
      resolve(self.proxy(className));
    });
    //console.warn("please, use `class.promise` for get class access");
    //return { promise: (await self.wrapClass(await self.construct(target.className, args))) };
  }
  apply(target, thisArg, argumentsList) {
    let self = this.self;
    if (thisArg) {
      console.warn("sorry, you can't call method with `this` context");
    };
    return self.call(target.className, args);
  }

}

class WSComlink {
  constructor(connection) {
    this.connection = connection;
    this.classes = {};
    this.calls = {};
    this.handler = new ClassHandler(this);
    this.watchers = {
      register: []
    };
    this.observe();
  }

  decodeArguments(args) {
    return JSON.parse(args);
  }

  encodeArguments(args) {
    return JSON.stringify(args);
  }

  sendAnswer(obj) {
    this.connection.send(JSON.stringify(obj));
  }

  sendRequest(obj) {
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

  register(name, object) {
    this.classes[name] = object;
    let id = uuid();
    this.sendAnswer({ id, type: "register", result: {
      className: name
    } });
  }

  observe() {
    this.connection.on("message", async (message, isBinary) => {
      let json = message.data ? message.data : message.toString('utf8');
      let {type, id, className, methodName, argsRaw, result} = JSON.parse(json);
      let args = argsRaw ? this.decodeArguments(argsRaw) : null;
      let callObj = this.calls[id];
      let classObj = this.classes[className];

      // remote methods
      if (type == "methods") {
        this.sendAnswer({
          type: "result",
          id,
          className,
          result: getAllFuncs(classObj)
        });
      }

      // 
      if (type == "properties") {
        this.sendAnswer({
          type: "result",
          id,
          className,
          result: Object.keys(classObj).concat(getAllSetterAndGetters(classObj))
        });
      }

      // remote function call
      if (type == "call") {
        this.sendAnswer({
          type: "result",
          id,
          className,
          methodName,
          result: methodName ? (await classObj[methodName](...args)) : (await classObj(...args))
        });
      }

      // remote create class (return link to class)
      if (type == "construct") {
        let newClassName = uuid();
        this.classes[newClassName] = new classObj(...args);
        this.sendAnswer({
          type: "result",
          id,
          className,
          result: newClassName
        });
      }

      // remote getter
      if (type == "get") {
        this.sendAnswer({
          type: "result",
          id,
          className,
          methodName,
          result: methodName ? (await classObj[methodName]) : (await classObj)
        });
      }

      // remote setter
      if (type == "set") {
        this.sendAnswer({
          type: "result",
          id,
          className,
          methodName,
          result: (methodName ? (classObj[methodName] = args[0]) : (classObj = args[0]))
        });
      }

      // remote results listener
      if (type == "result" && callObj) {
        callObj.resolve(result);
      }

      // on register event
      if (type == "register") {
        this.watchers["register"].forEach((cb) => {
          cb(result);
        })
      }
    });

    this.connection.on("close", (reason, details) => {
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

  methods(className) {
    return this.sendRequest({ type: "methods", className });
  }

  properties(className) {
    return this.sendRequest({ type: "properties", className });
  }

  set(className, methodName, value) {
    //value = !(typeof methodName == "string" || methodName instanceof String) ? methodName : value;
    //methodName = (typeof methodName == "string" || methodName instanceof String) ? methodName : "";
    return this.sendRequest({ type: "set", className, methodName, argsRaw: this.encodeArguments([value]) });
  }

  get(className, methodName) {
    methodName = (typeof methodName == "string" || methodName instanceof String) ? methodName : "";
    return this.sendRequest({ type: "get", className, methodName });
  }

  call(className, methodName, args) {
    args = Array.isArray(methodName) ? methodName : args;
    methodName = (typeof methodName == "string" || methodName instanceof String) ? methodName : "";
    return this.sendRequest({ type: "call", className, methodName, argsRaw: this.encodeArguments(args) });
  }

  construct(className, args) {
    return this.sendRequest({ type: "construct", className, argsRaw: this.encodeArguments(args) });
  }

  async proxy(className) {
    let proxy = null;
    let [methods, properties] = await Promise.all([this.methods(className), this.properties(className)]);

    // make promise for proxy
    let obj = function(...args) {
      console.error("For Proxy, isn't it?");
    };
    Object.assign(obj, { className, methods, properties, last: null });

    //
    return (proxy = new Proxy(obj, this.handler));
  }
}

export default WSComlink;
