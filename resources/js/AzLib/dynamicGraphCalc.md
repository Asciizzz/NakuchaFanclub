# Dynamic Graph Compute Function Design (AzLib)

## Goal

Support dynamic `y = f(x, z, a, b, c, ...)` at runtime without hardcoding one compute entry per function.

The user can type/edit expression strings, and the compute pass evaluates them on GPU through a fixed kernel.

## Core Strategy

Do not parse strings on GPU.
Parse and compile on CPU, evaluate on GPU.

Recommended flow:

1. Expression string -> tokens
2. Tokens -> AST
3. AST -> normalized IR
4. IR -> compact bytecode (or RPN instruction stream)
5. Compute shader interprets instructions per sample point

This gives dynamic behavior with a single compute shader binary.

## Expression Model

Use a restricted math grammar.

Allowed:

- variables: `x`, `z`, `t`
- user params: `a`, `b`, `c`, ... (named params table)
- constants: numeric literals
- operators: `+ - * / ^`
- unary: `+ -`
- functions: `sin cos tan asin acos atan abs floor ceil round min max clamp mix pow exp log sqrt`
- parentheses

Not allowed:

- loops
- recursion
- user-defined functions
- side effects

This keeps the IR finite and deterministic.

## Compile Pipeline

### 1) Tokenize

Convert source into token stream:

- number
- identifier
- operator
- punctuation (`(` `)` `,`)

### 2) Parse

Use Pratt parser or shunting-yard.
Output AST with operator precedence handled.

### 3) Normalize

Lower AST into strict node kinds:

- `Const`
- `VarX`, `VarZ`, `VarT`
- `Param(index)`
- `Unary(op, arg)`
- `Binary(op, lhs, rhs)`
- `Call(fn, args...)`

Run small simplifications:

- constant folding
- neutral elimination (`x + 0`, `x * 1`)
- canonical ordering for commutative ops where valid

### 4) Lower to Bytecode

Emit stack-machine instructions (RPN style).

Example:

`sin(a * x) * cos(b * z) + c`

becomes conceptually:

`PARAM(a), VAR_X, MUL, SIN, PARAM(b), VAR_Z, MUL, COS, MUL, PARAM(c), ADD`

## GPU Evaluation Model

Each compute invocation:

1. Resolve its sample coordinate -> `(x, z)`
2. Initialize local stack
3. Iterate instruction stream
4. Execute opcodes
5. Result stack top is `y`
6. Write output height

Important:

- Keep fixed max instruction count and stack size
- If a program uses fewer instructions, stop at `END` opcode

## Instruction Set (Suggested)

Keep opcodes small and stable.

Scalar push/load:

- `END`
- `PUSH_CONST idx`
- `PUSH_PARAM idx`
- `PUSH_X`
- `PUSH_Z`
- `PUSH_T`

Unary:

- `NEG`
- `ABS`
- `SIN`
- `COS`
- `TAN`
- `ASIN`
- `ACOS`
- `ATAN`
- `EXP`
- `LOG`
- `SQRT`
- `FLOOR`
- `CEIL`
- `ROUND`

Binary:

- `ADD`
- `SUB`
- `MUL`
- `DIV`
- `POW`
- `MIN`
- `MAX`

Ternary/special:

- `CLAMP`
- `MIX`

## Parameter Handling

Keep a symbol table on CPU:

```js
{
  a: 0,
  b: 1,
  c: 2
}
```

Compiler resolves identifiers into param indices.
At runtime, param values are updated directly by index.

No shader recompilation needed for param value changes.

## Safety Rules

To avoid invalid output and GPU divergence issues:

- hard cap instruction count (example: 256)
- hard cap stack depth (example: 64)
- clamp extreme intermediate values
- protect divisions by near-zero (`abs(den) < eps`)
- sanitize non-finite results (`NaN`, `Inf`) to fallback value

On compile failure, keep previous valid program active.

## Performance Notes

Interpreter cost is higher than a fully specialized shader.
To keep it practical:

- keep grammar small
- fold constants aggressively on CPU
- cache compiled bytecode by canonical expression string
- keep opcode set branch-light

For heavy expressions, optional tiering:

- Tier 1: bytecode interpreter (default dynamic mode)
- Tier 2: generated specialized WGSL for hot expressions (optional future)

## Smooth Function Switching

For graph transition without snapping:

1. Keep two programs: `prevProgram` and `nextProgram`
2. Evaluate both per sample
3. Blend `y = mix(prevY, nextY, alpha)`
4. Animate `alpha` from `0 -> 1`

No need to mutate mesh topology, only output heights.

## Minimal API Shape (Suggested)

```js
const graph = new AzGraphCompute();

graph.compile("sin(a*x) * cos(b*z) + c");
graph.setParam("a", 1.5);
graph.setParam("b", 0.8);
graph.setParam("c", 0.2);
graph.dispatch({ timeSec, alpha });
```

Where:

- `compile` updates bytecode/metadata
- `setParam` only updates param values
- `dispatch` runs compute with current program state

## Why This Works

You get dynamic expression behavior while keeping compute shader static.
The flexibility lives in CPU-side compilation + GPU-side instruction interpretation.
That is the cleanest way to emulate "string-driven function logic" in compute without per-expression hardcoded entry points.
