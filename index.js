function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/*
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

function getAllGetters(toCheck) {
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
    if (e.name!=(arr[i+1]?arr[i+1].name:"") && (descriptor.get)) return true;
  });

  return list.map((p)=>{return p.name;});
}

function getAllSetters(toCheck) {
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
    if (e.name!=(arr[i+1]?arr[i+1].name:"") && (descriptor.set)) return true;
  });

  return list.map((p)=>{return p.name;});
}
*/

class ClassHandler {
  constructor(self) {
    this.self = self;
  }
  get (target, name) {
    let self = this.self;
    if (name == "_last") { return target.last; } else
    if (name == "then") { return target.then && typeof target.then == "function" ? target.then.bind(target) : null; } else
    if (name == "catch") { return target.catch && typeof target.catch == "function" ? target.catch.bind(target) : null; } else
    if (name == "$isProxy") { return true; } else
    if (name == "$className") { return target.className; } else
    if (name == "$temporary") { return target.temporary; } else
    {
      return (async()=>{
        if (target.last) { await target.last; }; target.last = null;
        return (self.get(target.className, name));
      })();
    }
  }
  async set (target, name, value) {
    let self = this.self;
      if (name == "$temporary") { target.temporary = !!value; } else
      {
        if (target.last) { await target.last; }; target.last = null; // await last action
        await (target.last = (self.set(target.className, name, value)));
      }
  }
  construct(target, args, newTarget) {
    let self = this.self;
    return new Promise(async (resolve, reject)=>{
      console.warn("we returned a promise to class, please wait it");
      if (target.last) { await target.last; }; target.last = null; // await last action
      let className = await self.construct(target.className, args);
      resolve(self.proxy(className));
    });
    //console.warn("please, use `class.promise` for get class access");
    //return { promise: (await self.wrapClass(await self.construct(target.className, args))) };
  }
  async apply(target, thisArg, args) {
    let self = this.self;
    if (thisArg) {
      console.warn("sorry, you can't call method with `this` context");
    };
    if (target.last) { await target.last; }; target.last = null; // await last action
    return self.call(target.className, args);
  }

}

class WSComlink {
  constructor(connection) {
    this.connection = connection;
    this.objects = {};
    this.calls = {};
    this.handler = new ClassHandler(this);
    this.watchers = {
      register: []
    };
    this.observe();
  }

  decodeArguments(args) {
    return JSON.parse(args).map((a)=>{
      let data = a.data;
      if (a.temporary && this.objects[a.className]) { data = this.objects[a.className]; delete this.objects[a.className]; } else // delete temporary and make direct call (non-native proxy)
      if ((a.type == "function" || a.type == "proxy") && this.objects[a.$className]) { data = this.objects[a.$className]; if (a.$temporary) { delete this.objects[a.$className]; }; } else  // identify, and make a direct call (native proxy)
      if ( a.type == "function" || a.type == "proxy") { data = this.proxy(a.className); }; // make proxy for functions and constructor's (non-native proxy)
      return data;
    });
  }

  encodeArguments(args) {
    return JSON.stringify(args.map((a)=>{
      let className = "";
      let typeOf = typeof a;
      let temporary = false;
      if (typeOf == "function" || a.$isProxy) { this.register(className = uuid(), a); temporary = true; };
      if (typeOf == "object") {};
      return {
        type: a.$isProxy ? "proxy" : typeOf,
        className, temporary,  // for identify own class
        $className: a.$className,
        $temporary: a.$temporary,
        data: a
      }
    }));
  }

  makeTemporary(classNameOrProxy) {
    let classObj = classNameOrProxy;
    if (typeof classNameOrProxy == "string" || classNameOrProxy instanceof String) {
      classObj = this.objects[classNameOrProxy];
    };
    if (classObj.$isProxy) {
      classObj.$temporary = true;
    };
    return classNameOrProxy;
  }

  sendAnswer(obj) {
    this.connection.send(JSON.stringify(obj));
  }

  sendRequest(obj) {
    let id = uuid();
    this.connection.send(JSON.stringify(Object.assign(obj, { id })));
    this.calls[id] = obj;

    //
    Object.assign(this.calls[id], {
      id, promise: new Promise((resolve, reject)=>{
        this.calls[id].resolve = (...args) => { resolve(...args); delete this.calls[id]; };
        this.calls[id].reject = (...args) => { reject(...args); delete this.calls[id]; };
      })
    });

    // handle type
    return (async()=>{
      let result = await this.calls[id].promise;
      if (result.type == "function") {
        return this.proxy(result.className);//(...args) => { return this.call(result.className, result.methodName, args); };
      } else {
        return result.data;
      }
    })();
  }

  register(name, object) {
    this.objects[name] = object;
    let id = uuid();
    this.sendAnswer({ id, type: "register", result: {
      className: name
    } });
  }

  observe() {
    this.connection.on("message", async (message, isBinary) => {
      let json = message.data ? message.data : message.toString('utf8');
      let {type, id, className, methodName, argsRaw, result, error} = JSON.parse(json);
      let args = argsRaw ? this.decodeArguments(argsRaw) : null;
      let callObj = this.calls[id];
      let classObj = this.objects[className];
      let got = undefined, typeOf = "undefined";

      // we also return argument lists for handling temporary objects
      try {
        switch(type) {
          case "call":
            got = methodName ? (await classObj[methodName](...args)) : (await classObj(...args)), typeOf = typeof got;
            result = { type: typeOf, className, methodName, argsRaw, data: got };
            break;
          case "construct":
            this.objects[className = uuid()] = new classObj(...args);
            result = { type: "object", className, methodName, argsRaw, data: className };
            break;
          case "get":
            got = methodName ? (await classObj[methodName]) : (await classObj), typeOf = typeof got;
            if (typeOf == "function") { this.objects[className = uuid()] = got.bind(classObj); methodName = ""; };
            result = { type: typeOf, className, methodName, argsRaw, data: got };
            break;
          case "set":
            got = (methodName ? (classObj[methodName] = args[0]) : (classObj = args[0])), typeOf = typeof got;
            result = { type: typeOf, className, methodName, argsRaw, data: got };
            break;
          default:
        }
      } catch(e) {
        error = `
Message: ${e.message}\n
Filename: ${e.fileName}\n
LineNumber: ${e.lineNumber}\n
MethodName: ${e.methodName}\n
ClassName: ${e.className}\n
`;
        console.error(`ERROR!\n${error}`);
      }

      // send result
      if (typeof result != "undefined") {
        this.sendAnswer({
          type: "result",
          id,
          className,
          methodName,
          result: result
        });
      }

      //
      if (typeof error != "undefined") {
        this.sendAnswer({
          type: "error",
          id,
          className,
          methodName,
          error: error
        });
      }

      // receive result
      if (type == "result" && callObj) {
        callObj.resolve(result);
      }

      // present full debug info
      if (type == "error" && callObj) {
        let fullError = `ERROR!\n
CallId: ${id}\n
Type: ${callObj.type}\n
ClassName: ${callObj.className}\n
MethodName: ${callObj.methodName}\n
Arguments: ${callObj.args}\n
${error}\n
Please, send it to server or user-end developers.
`;
        callObj.reject(fullError);
        console.error(fullError);
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
        let error = `DISCONNECTED!\n
CallId ${id}\n
Type ${callObj.type}\n
ClassName ${callObj.className}\n
MethodName ${callObj.methodName}\n
Arguments ${callObj.args}\n
Reason ${reason}\n
Details: ${details}\n
Please, notify server developers, or try to reload webpage.
`;
        callObj.reject(error);
        console.error(error);
      }
    });
  }

  on(name, cb) {
    this.watchers[name].push(cb);
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

  proxy(className) {
    let proxy = null;

    // make promise for proxy
    let obj = function(...args) {
      console.error("For Proxy, isn't it?");
    };
    Object.assign(obj, { className, last: null, temporary: false });

    //
    return (proxy = new Proxy(obj, this.handler));
  }
}

export default WSComlink;
