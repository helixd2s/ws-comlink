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
    if (typeof methodNameOrPath == "string" && methodNameOrPath) {
      // TODO: corrent path
      this.objOrName = objOrName;
      this.methodNameOrPath = methodNameOrPath;
    } else 
    if (typeof objOrName == "string" && objOrName) {
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
    return (typeof this.objOrName == "string" && this.objOrName) ? Reflect.get(this.parent || {}, this.objOrName) : this.objOrName;
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
    if (typeof this.methodNameOrPath == "string" && this.methodNameOrPath) {
      let splitPath = this.methodNameOrPath.split(".");
      return (new ClassRouter(this.obj, splitPath.shift(), splitPath.join("."))).objParent;
    } else {
      return this.parent;
    }
  }
  get delete() {
    if (typeof this.methodNameOrPath == "string" && this.methodNameOrPath) {
      let splitPath = this.methodNameOrPath.split(".");
      (new ClassRouter(this.obj, splitPath.shift(), splitPath.join("."))).delete;
    } else {
      this.obj = undefined;
    }
  }
  get value() {
    if (typeof this.methodNameOrPath == "string" && this.methodNameOrPath) {
      let splitPath = this.methodNameOrPath.split(".");
      return (new ClassRouter(this.obj, splitPath.shift(), splitPath.join("."))).value;
    } else {
      return this.obj;
    }
  }
  set value(a) {
    if (typeof this.methodNameOrPath == "string" && this.methodNameOrPath) {
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
        if (target.last) { await target.last; }; target.last = null;
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

class WSComlink {
  constructor(connection, observe = true) {
    this.connection = connection;
    this.objects = {};
    this.calls = {};
    this.handler = new ClassHandler(this);
    this.watchers = {
      register: []
    };
    if (observe) { this.observe(); };
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
    let className = a && a.$origin ? a.$origin.className : payload.className;
    let temporary = a && a.$origin ? a.$origin.temporary : payload.temporary;
    let typeOf = typeof a;
    let data = a;
    if (typeOf == "function" || (a && (a.$isProxy || a.$isClass))) { 
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
    return wrap((async()=>{ return this.handleResult(await this.calls[id].promise); })());
  }

  register(name, object, notify = true) {
    this.objects[name] = object;
    let id = uuid();
    if (notify) {
      this.sendAnswer({
        id, type: "register", result: {
          className: name
        }
      });
    };
  }

  // we use join(".") and split(".") on names, be carefully
  router(classObjOrClassName, methodNameOrPath = "") {
    return new ClassRouter(this.objects, classObjOrClassName, methodNameOrPath);
  }

  observe() {
    this.connection.on("message", async (message, isBinary) => {
      let json = message.data ? message.data : message.toString('utf8');
      let {type, thisArgRaw, id, className, methodName, argsRaw, result, error} = JSON.parse(json);
      let args = argsRaw ? this.decodeArguments(argsRaw) : null;
      let thisArg = thisArgRaw ? (this.handleResult(thisArgRaw)) : null;
      let callObj = this.calls[id];
      let classObj = this.router(className, methodName);
      let got = undefined;
      let temporary = false;
      let hasResult = false;
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
            got = await classObj.value;
            hasResult = true;
            break;
          case "set":
            got = (classObj.value = args[0]); hasResult = true;
            break;
          default:
        }
      } catch(e) {
        exception = e;
        error = `
Message: ${e.message}\n
Filename: ${e.fileName}\n
LineNumber: ${e.lineNumber}\n
MethodName: ${e.methodName}\n
ClassName: ${e.className}\n
`;
      }

      // send result
      if (hasResult) {
        this.sendAnswer({
          type: "result",
          id,
          className,
          methodName,
          result: (result = this.handleArgument(got))
        });
      }

      //
      if (typeof error != "undefined") {
        //throw exception;
        console.error(`ERROR!\n${error}`);
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

  delete(className, methodName) {
    methodName = (typeof methodName == "string" || methodName instanceof String) ? methodName : "";
    return this.sendRequest({ type: "delete", className, methodName });
  }

  get(className, methodName) {
    methodName = (typeof methodName == "string" || methodName instanceof String) ? methodName : "";
    return this.sendRequest({ type: "get", className, methodName });
  }

  apply(className, methodName, args, thisArg) {
    args = Array.isArray(methodName) ? methodName : args;
    methodName = (typeof methodName == "string" || methodName instanceof String) ? methodName : "";
    let thisArgRaw = this.handleArgument(this.makeClass(thisArg));
    return this.sendRequest({ type: "apply", className, methodName, thisArgRaw, argsRaw: this.encodeArguments(args) });
  }

  construct(className, args) {
    return this.sendRequest({ type: "construct", className, argsRaw: this.encodeArguments(args) });
  }

  proxy(className, origin={}) {
    // make promise for proxy
    let obj = function(...args) {
      console.error("For Proxy, isn't it?");
    };
    Object.assign(obj, { origin: {...origin, className: origin.className||className}, className, last: null, temporary: false });
    return (new Proxy(obj, this.handler));
  }
}

export default WSComlink;
