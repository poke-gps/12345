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

