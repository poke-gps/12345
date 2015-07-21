// Note no var - intentionally global
RuntimeLibrary = {
  // Returns the C function with a specified identifier (for C++, you need to do manual name mangling)
  getCFunc: function(ident) {
    var func = Module['_' + ident]; // closure exported function
    if (!func) {
#if NO_DYNAMIC_EXECUTION == 0
      try {
        func = eval('_' + ident); // explicit lookup
      } catch(e) {}
#else
      abort('NO_DYNAMIC_EXECUTION was set, cannot eval - ccall/cwrap are not functional');
#endif
    }
    assert(func, 'Cannot call unknown function ' + ident + ' (perhaps LLVM optimizations or closure removed it?)');
    return func;
  },

  CCALL__postset: 'CCALL.init();',
  CCALL: {
    init: function() {
      var JSfuncs = {
        // Helpers for cwrap -- it can't refer to Runtime directly because it might
        // be renamed by closure, instead it calls JSfuncs['stackSave'].body to find
        // out what the minified function name is.
        'stackSave': function() {
          Runtime.stackSave()
        },
        'stackRestore': function() {
          Runtime.stackRestore()
        },
        // type conversion from js to c
        'arrayToC' : function(arr) {
          var ret = Runtime.stackAlloc(arr.length);
          writeArrayToMemory(arr, ret);
          return ret;
        },
        'stringToC' : function(str) {
          var ret = 0;
          if (str !== null && str !== undefined && str !== 0) { // null string
            // at most 4 bytes per UTF-8 code point, +1 for the trailing '\0'
            ret = Runtime.stackAlloc((str.length << 2) + 1);
            writeStringToMemory(str, ret);
          }
          return ret;
        }
      };
      // For fast lookup of conversion functions
      var toC = {'string' : JSfuncs['stringToC'], 'array' : JSfuncs['arrayToC']};

      // C calling interface. 
      CCALL.ccall = function ccallFunc(ident, returnType, argTypes, args, opts) {
        var func = getCFunc(ident);
        var cArgs = [];
        var stack = 0;
#if ASSERTIONS
        assert(returnType !== 'array', 'Return type should not be "array".');
#endif
        if (args) {
          for (var i = 0; i < args.length; i++) {
            var converter = toC[argTypes[i]];
            if (converter) {
              if (stack === 0) stack = Runtime.stackSave();
              cArgs[i] = converter(args[i]);
            } else {
              cArgs[i] = args[i];
            }
          }
        }
        var ret = func.apply(null, cArgs);
#if ASSERTIONS
        if ((!opts || !opts.async) && typeof EmterpreterAsync === 'object') {
          assert(!EmterpreterAsync.state, 'cannot start async op with normal JS calling ccall');
        }
        if (opts && opts.async) assert(!returnType, 'async ccalls cannot return values');
#endif
        if (returnType === 'string') ret = Pointer_stringify(ret);
        if (stack !== 0) {
          if (opts && opts.async) {
            EmterpreterAsync.asyncFinalizers.push(function() {
              Runtime.stackRestore(stack);
            });
            return;
          }
          Runtime.stackRestore(stack);
        }
        return ret;
      }

#if NO_DYNAMIC_EXECUTION == 0
      var sourceRegex = /^function\s*\(([^)]*)\)\s*{\s*([^*]*?)[\s;]*(?:return\s*(.*?)[;\s]*)?}$/;
      function parseJSFunc(jsfunc) {
        // Match the body and the return value of a javascript function source
        var parsed = jsfunc.toString().match(sourceRegex).slice(1);
        return {arguments : parsed[0], body : parsed[1], returnValue: parsed[2]}
      }
      var JSsource = {};
      for (var fun in JSfuncs) {
        if (JSfuncs.hasOwnProperty(fun)) {
          // Elements of toCsource are arrays of three items:
          // the code, and the return value
          JSsource[fun] = parseJSFunc(JSfuncs[fun]);
        }
      }

      
      CCALL.cwrap = function cwrap(ident, returnType, argTypes) {
        argTypes = argTypes || [];
        var cfunc = getCFunc(ident);
        // When the function takes numbers and returns a number, we can just return
        // the original function
        var numericArgs = argTypes.every(function(type){ return type === 'number'});
        var numericRet = (returnType !== 'string');
        if ( numericRet && numericArgs) {
          return cfunc;
        }
        // Creation of the arguments list (["$1","$2",...,"$nargs"])
        var argNames = argTypes.map(function(x,i){return '$'+i});
        var funcstr = "(function(" + argNames.join(',') + ") {";
        var nargs = argTypes.length;
        if (!numericArgs) {
          // Generate the code needed to convert the arguments from javascript
          // values to pointers
          funcstr += 'var stack = ' + JSsource['stackSave'].body + ';';
          for (var i = 0; i < nargs; i++) {
            var arg = argNames[i], type = argTypes[i];
            if (type === 'number') continue;
            var convertCode = JSsource[type + 'ToC']; // [code, return]
            funcstr += 'var ' + convertCode.arguments + ' = ' + arg + ';';
            funcstr += convertCode.body + ';';
            funcstr += arg + '=' + convertCode.returnValue + ';';
          }
        }

        // When the code is compressed, the name of cfunc is not literally 'cfunc' anymore
        var cfuncname = parseJSFunc(function(){return cfunc}).returnValue;
        // Call the function
        funcstr += 'var ret = ' + cfuncname + '(' + argNames.join(',') + ');';
        if (!numericRet) { // Return type can only by 'string' or 'number'
          // Convert the result to a string
          var strgfy = parseJSFunc(function(){return Pointer_stringify}).returnValue;
          funcstr += 'ret = ' + strgfy + '(ret);';
        }
#if ASSERTIONS
        funcstr += "if (typeof EmterpreterAsync === 'object') { assert(!EmterpreterAsync.state, 'cannot start async op with normal JS calling cwrap') }";
#endif
        if (!numericArgs) {
          // If we had a stack, restore it
          funcstr += JSsource['stackRestore'].body.replace('()', '(stack)') + ';';
        }
        funcstr += 'return ret})';
        return eval(funcstr);
      };
#else
      // NO_DYNAMIC_EXECUTION is on, so we can't use the fast version of cwrap.
      // Fall back to returning a bound version of ccall.
      CCALL.cwrap = function cwrap(ident, returnType, argTypes) {
        return function() {
#if ASSERTIONS
          Runtime.warnOnce('NO_DYNAMIC_EXECUTION was set, '
                         + 'using slow cwrap implementation');
#endif
          return ccall(ident, returnType, argTypes, arguments);
        }
      }
#endif
    },
  },

  ccall__deps: ['CCALL'],
  ccall: function(ident, returnType, argTypes, args, opts) {
    return CCALL.ccall(ident, returnType, argTypes, args, opts);
  },
  cwrap__deps: ['CCALL'],
  cwrap: function(ident, returnType, argTypes) {
    return CCALL.cwrap(ident, returnType, argTypes);
  },
};

(function() {
  var fixed = {};
  for (var i in RuntimeLibrary) {
    fixed['$' + i] = RuntimeLibrary[i];
    // fix deps too
    var j = i.lastIndexOf('__');
    if (j < 0) continue;
    if (i.substr(j) !== '__deps') continue;
    var o = RuntimeLibrary[i];
    for (var k = 0; k < o.length; k++) {
      var curr = o[k];
      if (RuntimeLibrary[curr]) {
        o[k] = '$' + curr;
      }
    }
  }

  mergeInto(LibraryManager.library, fixed);

  for (var i = 0; i < EXPORTED_RUNTIME_METHODS.length; i++) {
    EXPORTED_RUNTIME_METHODS[i] = '$' + EXPORTED_RUNTIME_METHODS[i];
  }
})();

