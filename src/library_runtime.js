var RuntimeLibrary = {
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
};

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

DEFAULT_LIBRARY_FUNCS_TO_INCLUDE = DEFAULT_LIBRARY_FUNCS_TO_INCLUDE.concat(EXPORTED_RUNTIME_METHODS);

