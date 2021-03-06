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



/* WRAP PROMISE */
let handlers = {};
const wrap = function (target) {
    if (typeof target === 'object' && target && typeof target.then === 'function') {
        // The target needs to be stored internally as a function, so that it can use
        // the `apply` and `construct` handlers.
        var targetFunc = function () { return target; };
        targetFunc._promise_chain_cache = Object.create(null);
        return new Proxy(targetFunc, handlers);
    }
    return target;
};
// original was written in TS > 2.5, you might need a polyfill :
if (typeof Reflect === 'undefined') {
    require('harmony-reflect');
}
Object.assign(handlers, {
    get: function (target, property) {
        if (property === 'inspect') {
            return function () { return '[chainable Promise]'; };
        }
        if (property === '_raw') {
            return target();
        }
        if (typeof property === 'symbol') {
            return target()[property];
        }
        // If the Promise itself has the property ('then', 'catch', etc.), return the
        // property itself, bound to the target.
        // However, wrap the result of calling this function.
        // This allows wrappedPromise.then(something) to also be wrapped.
        if (property in target()) {
            const isFn = typeof target()[property] === 'function';
            if (property !== 'constructor' && !property.startsWith('_') && isFn) {
                return function () {
                    return wrap(target()[property].apply(target(), arguments));
                };
            }
            return target()[property];
        }

        // 
        let handleCache = async (result)=>{ return (await result[property]); };

        // If the property has a value in the cache, use that value.
        if (Object.prototype.hasOwnProperty.call(target._promise_chain_cache, property)) {
            return target._promise_chain_cache[property].then(handleCache);
        }
        // If the Promise library allows synchronous inspection (bluebird, etc.),
        // ensure that properties of resolved
        // Promises are also resolved immediately.
        const isValueFn = typeof target().value === 'function';
        if (target().isFulfilled && target().isFulfilled() && isValueFn) {
            return wrap(target().constructor.resolve(target().value()[property]));
        }
        // Otherwise, return a promise for that property.
        // Store it in the cache so that subsequent references to that property
        // will return the same promise.
        target._promise_chain_cache[property] = wrap(target().then(function (result) {
            if (typeof result != "undefined" && (typeof result === 'object' || typeof result === 'function')) {
              //return wrap(result[property]);
              return result; // TODO correct cache support
            }
            const _p = `"${property}" of "${result}".`;
            throw new TypeError(`Promise chain rejection: Cannot read property ${_p}`);
        }));
        return target._promise_chain_cache[property].then(handleCache);
    },
    apply: function (target, thisArg, args) {
        // If the wrapped Promise is called, return a Promise that calls the result
        return wrap(target().constructor.all([target(), thisArg]).then(function (results) {
            if (typeof results[0] === 'function') {
                return wrap(Reflect.apply(results[0], results[1], args));
            }
            throw new TypeError(`Promise chain rejection: Attempted to call ${results[0]}` +
                ' which is not a function.');
        }));
    },
    construct: function (target, args) {
        return wrap(target().then(function (result) {
            return wrap(Reflect.construct(result, args));
        }));
    }
});
// Make sure all other references to the proxied object refer to the promise itself,
// not the function wrapping it
Object.getOwnPropertyNames(Reflect).forEach(function (handler) {
    handlers[handler] = handlers[handler] || function (target, ...args) {
      //return Reflect[handler](target(), ...args);
      // prefer to apply with result object
      return wrap(target().then((results)=>{
        return Reflect[handler](results, ...args);
      }));
    };
});



class ClassRouter {
  constructor(parent, objOrName = "", methodNameOrPath = "") {
    this.parent = parent;
    if (methodNameOrPath && typeof methodNameOrPath == "string") {
      // TODO: corrent path
      this.objOrName = objOrName;
      this.methodNameOrPath = methodNameOrPath;
    } else 
    if (objOrName && typeof objOrName == "string") {
      // set true path
      let splitPath = objOrName.split(".");
      this.objOrName = splitPath.shift();
      this.methodNameOrPath = splitPath.join(".");
    } else {
      // default path
      this.objOrName = objOrName || "";
      this.methodNameOrPath = methodNameOrPath;
    }
  }
  get obj() {
    return (this.objOrName && typeof this.objOrName == "string") ? Reflect.get(this.parent || {}, this.objOrName) : this.objOrName;
  }
  set obj(a) {
    let obj = this.obj;
    if (typeof obj == "object") { Object.assign(obj, a); } else  
    if (typeof this.objOrName == "string") {
      if (typeof a == "undefined") { Reflect.deleteProperty(this.parent || {}, this.objOrName); } else { Reflect.set(this.parent || {}, this.objOrName, a); };
    } else {
      console.error("class is not assignable, no context");
    }
  }
  get objParent() {
    if (this.methodNameOrPath && typeof this.methodNameOrPath == "string") {
      let splitPath = this.methodNameOrPath.split(".");
      return (new ClassRouter(this.obj, splitPath.shift(), splitPath.join("."))).objParent;
    } else {
      return this.parent;
    }
  }
  get delete() {
    if (this.methodNameOrPath && typeof this.methodNameOrPath == "string") {
      let splitPath = this.methodNameOrPath.split(".");
      (new ClassRouter(this.obj, splitPath.shift(), splitPath.join("."))).delete;
    } else {
      this.obj = undefined;
    }
  }
  get value() {
    if (this.methodNameOrPath && typeof this.methodNameOrPath == "string") {
      let splitPath = this.methodNameOrPath.split(".");
      return (new ClassRouter(this.obj, splitPath.shift(), splitPath.join("."))).value;
    } else {
      return this.obj;
    }
  }
  set value(a) {
    if (this.methodNameOrPath && typeof this.methodNameOrPath == "string") {
      let splitPath = this.methodNameOrPath.split(".");
      (new ClassRouter(this.obj, splitPath.shift(), splitPath.join("."))).value = a;
    } else {
      this.obj = a;
    }
  }
};

class ClassHandler {
  constructor(self) {
    this.self = self;
  }
  get (target, name) {
    let self = this.self;
    if (name == "call") { return (thisArg, ...args)=>{
      return wrap((async()=>{
        if (target.last) { await target.last; }; target.last = null; // await last action
        return (await self.apply(target.className, null, args, thisArg));
      })());
    }; } else
    if (name == "apply") { return (thisArg, args)=>{
      return wrap((async()=>{
        if (target.last) { await target.last; }; target.last = null; // await last action
        return (await self.apply(target.className, null, args, thisArg));
      })());
    }; } else
    if (name == "bind") { return (thisArg, ...args)=>{ return ()=>{ return wrap((async()=>{
        if (target.last) { await target.last; }; target.last = null; // await last action
        return (await self.apply(target.className, null, args, thisArg));
      })());
    }}; } else
    if (name == "_last") { return target.last; } else
    if (name == "then") { return target.then && typeof target.then == "function" ? target.then.bind(target) : null; } else
    if (name == "catch") { return target.catch && typeof target.catch == "function" ? target.catch.bind(target) : null; } else
    if (name == "$isProxy") { return true; } else
    if (name == "$origin") { return target.origin; } else
    if (name == "$className") { return target.className; } else
    if (name == "$temporary") { return target.temporary; } else
    {
      return wrap((async()=>{
        if (target.last) { await target.last; }; target.last = null;
        return (await self.get(target.className, name));
      })());
    }
  }
  deleteProperty (target, name) {
    let self = this.self;
    {
      return wrap((async()=>{
        if (target.last) { await target?.last; }; target.last = null;
        return await (target.last = self.delete(target.className, name));
      })());
    }
  }
  set (target, name, value) {
    let self = this.self;
    if (name == "$temporary") { return (target.temporary = !!value); } else
    {
      return wrap((async()=>{
        if (target.last) { await target.last; }; target.last = null; // await last action
        return await (target.last = (self.set(target.className, name, value)));
      })());
    }
  }
  construct(target, args, newTarget) {
    let self = this.self;
    return wrap((async()=>{
      console.warn("we returned a promise to class, please wait it");
      if (target.last) { await target.last; }; target.last = null; // await last action
      return (await self.construct(target.className, args));
    })());
  }
  apply(target, thisArg, args) {
    let self = this.self;
    //if (thisArg) {
    //  console.warn("sorry, you can't call method with `this` context");
    //};
    return wrap((async()=>{
      if (target.last) { await target.last; }; target.last = null; // await last action
      return (await self.apply(target.className, null, args));
    })());
  }
}

class CommandEncoder {
  constructor(pt = null) {
    this.pt = pt;
    if (!this.pt?.getCommandEncoder()) { this.pt?.setCommandEncoder(this); };
  }

  setProtocol(pt) {
    //if (!pt.getExecutor()) { pt.setExecutor(this); };
    let result = (this.pt = pt);
    if (!pt?.getCommandEncoder()) { pt?.setCommandEncoder(this); };
    return result;
  }

  getProtocol() {
    return this.pt;
  }

  setExecutor(exec) {
    let result = (this.exec = exec);
    if (!exec.cmd) { exec?.setCommandEncoder(this); };
    return result;
  }

  getExecutor() {
    return this.exec;
  }

  set(className, methodName, value) {
    //value = !(typeof methodName == "string" || methodName instanceof String) ? methodName : value;
    //methodName = (typeof methodName == "string" || methodName instanceof String) ? methodName : "";
    let pt = this.pt;
    return { type: "set", className, methodName, argsRaw: pt.encodeArguments([value]) };
  }

  delete(className, methodName) {
    methodName = (typeof methodName == "string" || methodName instanceof String) ? methodName : "";
    return { type: "delete", className, methodName }
  }

  get(className, methodName) {
    methodName = (typeof methodName == "string" || methodName instanceof String) ? methodName : "";
    return { type: "get", className, methodName }
  }

  apply(className, methodName, args, thisArg) {
    let pt = this.pt;
    args = Array.isArray(methodName) ? methodName : args;
    methodName = (typeof methodName == "string" || methodName instanceof String) ? methodName : "";
    let thisArgRaw = pt.handleArgument(pt.makeClass(thisArg));
    return { type: "apply", className, methodName, thisArgRaw, argsRaw: pt.encodeArguments(args) };
  }

  construct(className, args) {
    let pt = this.pt;
    return { type: "construct", className, argsRaw: pt.encodeArguments(args) };
  }
}

class Protocol {
  constructor(handler = null, cmd = null) {
    this.cmd = cmd;
    this.handler = handler;
    this.objects = {};
    this.calls = {};
    this.watchers = {
      register: []
    };
    if (!this.cmd?.getProtocol()) { 
      this.cmd?.setProtocol(this);
    };
  }

  handle(cmdObj) {
    let id = cmdObj.id ? cmdObj.id : uuid();
    let pt = this;
    let calls = this.calls;
    calls[id] = {};
    calls[id] = Object.assign(calls[id], {
      id, cmdObj: Object.assign(cmdObj, {id}), promise: new Promise((resolve, reject) => {
        calls[id].resolve = (...args) => {
          resolve(...args);
          delete calls[id];
        };
        calls[id].reject = (...args) => {
          reject(...args);
          delete calls[id];
        };
      })
    });
    return calls[id];
  }

  setExecutor(exec) {
    let result = (this.exec = exec);
    if (!exec?.getProtocol()) { exec?.setProtocol(this); };
    return result;
  }

  getExecutor() {
    return this.exec;
  }

  setCommandEncoder(cmd) {
    let result = (this.cmd = cmd);
    if (!cmd?.getProtocol) { cmd?.setProtocol(this); };
    return result;
  }

  getCommandEncoder() {
    return this.cmd;
  }

  setClassHandler(handler) {
    return (this.handler = handler);
  }

  getClassHandler() {
    return this.handler;
  }

  on(name, cb) {
    this.watchers[name].push(cb);
  }

  setObject(name, object) {
    return (this.objects[name] = object);
  }

  getObject(name) {
    return this.objects[name];
  }

  setCall(name, call) {
    return (this.calls[name] = call);
  }

  getCall(name) {
    return this.calls[name];
  }

  handleResult(a) {
    let data = a.data;
    if (a.type == "proxy") {
      let $classNameValue = this.router(a.$className).value;
      if ($classNameValue) {
        // identity as own, and make a direct call (native proxy)
        data = $classNameValue; if (a.$temporary) { $classNameRouter.value = undefined; };
      } else {
        // it probably is foreign proxy
        data = this.proxy(data, {className: a.$className, temporary: a.$temporary}); // set proxy with origin
      }
    }
    return data;
  }

  handleArgument(a, payload={}) {
    let className = (a?.$origin) ? a.$origin.className : payload.className;
    let temporary = (a?.$origin) ? a.$origin.temporary : payload.temporary;
    let typeOf = typeof a;
    let data = a;
    if (typeOf == "function" || (a?.$isProxy || a?.$isClass)) {
      this.register(data = uuid(), a, !payload.temporary);
      typeOf = "proxy";
    };
    if (typeOf == "object") {};
    return {
      ...payload,
      type: typeOf,
      temporary: payload.temporary, // for post-handlers
      $className: className, $temporary: temporary, // for argument handlers
      data
    }
  }

  decodeArguments(args) {
    return JSON.parse(args).map((a)=>{ return this.handleResult(a); });
  }

  encodeArguments(args) {
    return JSON.stringify(args.map((a)=>{ return this.handleArgument(a, {temporary: true}); }));
  }

  makeClass(classNameOrProxy) {
    let router = this.router(classNameOrProxy);
    let classObj = router.value;
    if (typeof classObj == "object") {
      classObj.$isClass = true;
    };
    return classNameOrProxy;
  }

  makeTemporary(classNameOrProxy) {
    let router = this.router(classNameOrProxy);
    let proxy = router.value;
    if (proxy.$isProxy) { proxy.origin.$temporary = true; };
    return classNameOrProxy;
  }

  proxy(className, origin={}) {
    // make promise for proxy
    let obj = function(...args) {
      console.error("For Proxy, isn't it?");
    };
    Object.assign(obj, { origin: {...origin, className: origin.className||className}, className, last: null, temporary: false });
    return (new Proxy(obj, this.handler));
  }

  // we use join(".") and split(".") on names, be carefully
  router(classObjOrClassName, methodNameOrPath = "") {
    return new ClassRouter(this.objects, classObjOrClassName, methodNameOrPath);
  }

  register(className, object, notify = true) {
    this.objects[className] = object;
    return {type: "register", result: {className}};
  };

  async handleEvent(json) {
    let {type, thisArgRaw, id, className, methodName, argsRaw, result, error, hasResult} = JSON.parse(json);
    let args = argsRaw ? this.decodeArguments(argsRaw) : null;
    let thisArg = thisArgRaw ? (this.handleResult(thisArgRaw)) : null;
    let callObj = this.calls[id];
    let classObj = this.router(className, methodName);
    let got = undefined;
    let temporary = false;
    let exception = undefined;

    // we also return argument lists for handling temporary objects
    try {
      switch(type) {
        case "delete":
          classObj.delete; hasResult = true;
          break;
        case "apply":
          got = await Reflect.apply(classObj.value, thisArg || classObj.objParent, args); hasResult = true;
          break;
        case "construct":
          got = this.makeClass(await Reflect.construct(classObj.value, args)); hasResult = true;
          break;
        case "get":
          got = await classObj.value; hasResult = true;
          break;
        case "set":
          got = (classObj.value = args[0]); hasResult = true;
          break;
        case "result":
          if (hasResult) {
            callObj.resolve(this.handleResult(result));
          } else {
            callObj.reject(result);
          }
          hasResult = false;
          break;
        default:
          hasResult = false;
      }
    } catch(e) {
      hasResult = false;
      exception = e;
      error = `
Message: ${e.message}\n
Filename: ${e.fileName}\n
LineNumber: ${e.lineNumber}\n
MethodName: ${e.methodName}\n
ClassName: ${e.className}\n
`;
    }

    if (hasResult) {
      result = this.handleArgument(got);
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

    return {id, result, exception, error, hasResult, className, methodName};
  }



  wrapPromise(callObj) {
    return wrap(callObj.promise);
  }

  close(reason, details) {
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
  }
};


class Executor {
  constructor(wsc = null, cmd = null) {
    this.wsc = wsc;
    this.cmd = cmd;
    this.wsc?.setExecutor(this);
    this.cmd?.setExecutor(this);
  }

  setCommandEncoder(cmd) {
    if (!cmd?.getExecutor()) { cmd?.setExecutor(this); };
    return (this.cmd = cmd);
  };

  getCommandEncoder() {
    return this.cmd;
  };

  set(className, methodName, value) {
    let wsc = this.wsc;
    let cmd = this.cmd;
    return wrap(wsc.sendRequest(cmd.set(className, methodName, value)));
  }

  delete(className, methodName) {
    let wsc = this.wsc;
    let cmd = this.cmd;
    return wrap(wsc.sendRequest(cmd.delete(className, methodName)));
  }

  get(className, methodName) {
    let wsc = this.wsc;
    let cmd = this.cmd;
    return wrap(wsc.sendRequest(cmd.get(className, methodName)));
  }

  apply(className, methodName, args, thisArg) {
    let wsc = this.wsc;
    let cmd = this.cmd;
    return wrap(wsc.sendRequest(cmd.apply(className, methodName, args, thisArg)));
  }

  construct(className, args) {
    let wsc = this.wsc;
    let cmd = this.cmd;
    return wrap(wsc.sendRequest(cmd.construct(className, args)));
  }
}

class WSComlink {
  constructor(connection, pt = null, observe = true) {
    this.connection = connection;

    // initialize
    if (!pt) {
      let cmd = new CommandEncoder();

      // need protocol for command encoding and execution
      this.pt = new Protocol(new ClassHandler(new Executor(this, cmd)), cmd);
    } else { this.pt = pt; };

    if (observe) { this.observe(); };
  }

  //
  setProtocol(pt) {return (this.pt = pt); };
  setExecutor(exec) {return (this.exec = exec); };

  //
  getProtocol() { return this.pt; };
  getExecutor() { return this.exec; };



  proxy(className, origin={}) {
    return this.pt.proxy(className, origin);
  }

  on(name, cb) {
    return this.pt.on(name, cb);
  }

  async sendAnswer(cmdObj) {
    let existId = await cmdObj.id;
    this.connection.send(JSON.stringify(Object.assign(cmdObj, {id: existId ? existId : uuid()})));
  }

  async sendRequest(cmdObj) {
    let callObj = this.pt.handle(cmdObj);
    let existId = await cmdObj.id;
    this.connection.send(JSON.stringify(Object.assign(cmdObj, {id: existId ? existId : uuid()})));
    return (await this.pt.wrapPromise(callObj));
  }

  register(name, object, notify = true) {
    if (notify) {
      this.sendAnswer(this.pt.register(name, object, notify));
    };
  }

  observe() {
    this.connection.on("message", async (message, isBinary) => {
      let json = message.data ? message.data : message.toString('utf8');
      let handled = await this.pt.handleEvent(json);
      let {result, exception, error, hasResult} = handled;

      // send result
      if (hasResult) {
        this.sendAnswer({type: "result", ...handled});
      }

      //
      if (typeof error != "undefined") {
        //throw exception;
        console.error(`ERROR!\n${error}`);
        this.sendAnswer({type: "error", ...handled });
      }
    });

    this.connection.on("close", this.pt.close.bind(this.pt));
  }
};

export default WSComlink;
export { WSComlink, Protocol, Executor, CommandEncoder };
