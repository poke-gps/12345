#
# This takes emterpreter (emterpretify.py) bytecode and converts it into asm.js code.
#

import shared, tempfiles
from emterpretify import OPCODES

# get opcodes
opcodes = ''
for i in range(len(OPCODES)):
  opcodes += '#define EMOP_%s %d\n' % (OPCODES[i], i)

# get emterpreter
temp = shared.configuration.get_temp_files().get('.js').name
shared.execute([shared.PYTHON, shared.EMCC, shared.path_from_root('tests', 'hello_world.c'), '-O1', '--memory-init-file', '1', '-s', 'EMTERPRETIFY=1', '-o', temp])
temp_js = open(temp).read()
start = temp_js.index('function emterpret(')
end = temp_js.index('\n}', start)
emterpreter = temp_js[start:end+2]

# process emterpreter: convert runnable emterpreter in JS into something that processes bytecode into JS
def magic(code):
  # this is super-hackish, but the emterpreter is so small, it is better to do this than to write a translator from scratch (there are over 100 opcodes...)
  code = code[code.index('{')+2:-2] # strip out function name and outer {}
  code = code.replace('pc = pc | 0;', '', 1) # unsigned char *base_pc = pc;\n int *HEAP32 = (int*)pc;', 1)
  code = code.replace('var sp = 0, inst = 0, lx = 0, ly = 0, lz = 0;', 'int inst; unsigned char lx, ly, lz;', 1)
  code = code.replace('sp = EMTSTACKTOP;', '', 1)
  code = code.replace('HEAPU8[pc + 1 >> 0] | 0', 'pc[1]', 1)
  code = code.replace('HEAPU8[pc + 2 >> 0] | 0', 'pc[2]', 1)
  code = code.replace('HEAPU8[pc + 4 >> 0] | 0', 'pc[4]', 1)
  code = code.replace('EMTSTACKTOP = EMTSTACKTOP + (lx << 3) | 0;', '', 1)
  code = code.replace('(ly | 0)', 'ly', 1)
  code = code.replace('(lz | 0)', 'lz', 1)
  code = code.replace('HEAPF64[sp + (ly << 3) >> 3] = ', '//', 1)
  code = code.replace(' + 4 | 0', ' + 4', 1)
  code = code.replace('HEAP32[pc >> 2] | 0', '*((int*)pc)', 1)
  code = code.replace('inst >> 8 & 255', '(unsigned char)(inst >> 8)', 1)
  code = code.replace('inst >> 16 & 255', '(unsigned char)(inst >> 16)', 1)
  code = code.replace('inst >>> 24', '(unsigned char)(inst >> 24)', 1)
  code = code.replace('inst & 255', '(unsigned char)inst', 1)
  # the main switch is the core code generation routine. each case has some code which runs in the emterpreter, and which we instead *emit*, here, after some transformations
  #for var in ['lx', 'ly', 'lz']:
  #  for suffix in [' | 0', '']:
  #    code = code.replace('HEAP32[sp + (' + var + ' << 3) >> 2]' + suffix, var)
  #  code = code.replace('(' + var + ')', var)
  #code = code.replace(' | 0;', ';', 1)
  #code = code.replace('', '', 1)



  return code
emterpreter = magic(emterpreter)

# combine them all
main = open(shared.path_from_root('tools', 'asmify.cpp')).read()
translator = opcodes + '\n\n' + main.replace('  PARSE_BLOCK;', emterpreter)
print translator

# build the result
temp2 = shared.configuration.get_temp_files().get('.js').name
open(temp2, 'w').write(translator)
shared.Building.emcc(temp2, ['-I' + shared.path_from_root('src', 'relooper')], 'asmify.js')

