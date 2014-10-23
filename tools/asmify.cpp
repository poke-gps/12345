
#include <stdio.h>
#include <string.h>
#include <assert.h>

#include <vector>
#include <map>
#include <string>

#include <emscripten.h>

#include <Relooper.cpp>

enum asmType {
  ASM_INT = 0,
  ASM_DOUBLE = 1
};

static const int BASE = 256*8;

std::map<int, std::string> funcMap;

std::string getFuncName(int offset) {
  offset += BASE; // bytecode offsets are absolute, given that our base begins at BASE
  funcMap::iterator found = funcMap.find(offset);
  if (funcMap != funcMap.end()) return *found;
  static char buffer[21];
  static int funcCounter = 0;
  int size = sprintf(buffer, "emt_%d", funcCounter++;
  assert(size < 20);
  buffer[size] = 0;
  std::string str = std::string(buffer);
  funcMap[offset] = str;
  return str;
}

std::vector<std::string> localNames;

unsigned char *getLocalName(int i) {
  // TODO: use minified names
  while (i >= localNames.size()) {
    static char buffer[21];
    int size = sprintf(buffer, "l%d", localNames.size());
    assert(size < 20);
    buffer[size] = 0;
    std::string str = std::string(buffer);
  }
  return localNames[i].c_str();
}

// parses a block of code, until we hit a control flow change (branch, return)
void parse_block(unsigned char *&pc, asmType *types) {
  PARSE_BLOCK;
}

// parses a function. modifies the input params
void parse_func(unsigned char *codeStart, unsigned char *&code, unsigned char *&output) {
  assert(code[0] == EMOP_FUNC);
  // emit name
  output += sprintf(output, "function %s(", getFuncName(code - codeStart));
  // parse attributes
  int totalLocals = code[1];
  int numParams = code[2];
  int which = code[3]; // ignored
  int combined = code[4]; // ignored
  code += 8;
  // parse blocks - needed to pick up type info, etc.
  asmType types[totalLocals];
  std::vector<Block*> blocks;
  while (code[0] != EMOP_FUNC) {
    blocks.push_back(parse_block(code, types));
  }
  // emit header
  for (int i = 0; i < numParams; i++) {
    if (i > 0) output += sprintf(output, ",");
    output += sprintf(output, "%s", getLocalName(i));
  }
  output += sprintf(output, "){");
  // emit vars XXX and params XXX
  // emit relooped blocks
  Relooper r;
  r.SetOutputBuffer(output, 1 << 30); // XXX size
  for (int i = 0; i < blocks.size(); i++) {
    r.AddBlock(blocks[i]);
  }
  r.Calculate(blocks[0]);
  r.Render();
  output = strchr(output, 0);
  output += sprintf(output, "}"); // TODO: ensure a return
}

// @code - the bytecode to convert
// @size - the size of the input code
// @output - a buffer to write to. must be big enough!
// returns the number of bytes written
int EMSCRIPTEN_KEEPALIVE asmify(unsigned char *code, int size, unsigned char *output) {
  unsigned char *codeStart = code;
  unsigned char *outputStart = output;
  while (code - codeStart < size) {
    parse_func(codeStart, code, output);
  }
  return output - outputStart;
}

