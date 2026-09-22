# Rust Macros: Declarative vs Procedural Metaprogramming

## The Problem: Boilerplate and Boilerplate Alone
In software engineering, repetition is the enemy of maintainability. We often find ourselves writing the same structural code repeatedly—implementing a trait for ten different numeric types, generating getter/setter methods, or building DSLs (Domain Specific Languages) like HTML routers or SQL query builders. Functions and generics allow us to abstract away repetitive logic and types, but they fall short when we need to abstract away *syntax itself*. If you need to generate code dynamically based on structural patterns at compile-time, you need a mechanism that operates on the code before it is fully compiled. 

Enter metaprogramming: code that writes code. In Rust, this is achieved through its powerful macro system.

## The Mental Model: Operating on Tokens, Not Strings
In languages like C, macros (`#define`) operate on raw text via preprocessor substitution. This text-replacement model is notorious for causing subtle bugs (like operator precedence errors or accidental variable capture). 

Rust takes a different approach. Rust macros do not operate on raw strings; they operate on **Token Streams**. A token is the smallest semantic unit of code (an identifier, a punctuation mark, a literal). Rust parses the source code into these tokens, passes them to the macro, and the macro outputs a new stream of tokens. This ensures that the generated code is syntactically valid and hygienically safe.

```text
+-------------------+       +-------------------+       +-------------------+
|  Raw Source Code  | ----> | Token Stream (In) | ----> |   Macro Engine    |
| (String / Text)   | Lexer | [Ident, Punct,  ] |       | (Pattern Match)   |
+-------------------+       +-------------------+       +-------------------+
                                                                 |
                                                                 v
+-------------------+       +-------------------+       +-------------------+
|  Compiled Binary  | <---- |     Abstract      | <---- | Token Stream (Out)|
|                   |       | Syntax Tree (AST) |       | [Expanded Tokens] |
+-------------------+       +-------------------+       +-------------------+
```

Rust provides two distinct flavors of macros: **Declarative Macros** and **Procedural Macros**.

## Declarative Macros: Pattern Matching on Syntax
Declarative macros (defined using `macro_rules!`) are the most common macro type. They work similarly to `match` expressions, but instead of matching on values, they match on the structural patterns of the token stream.

When a declarative macro is invoked, the compiler checks the input tokens against a series of rules. If a rule matches, the macro emits the corresponding block of code.

```rust
macro_rules! vec_custom {
    // Match empty invocation: vec_custom!()
    () => {
        std::vec::Vec::new()
    };
    // Match a repeating pattern: vec_custom!(1, 2, 3)
    ( $( $elem:expr ),* ) => {
        {
            let mut temp_vec = std::vec::Vec::new();
            $(
                temp_vec.push($elem);
            )*
            temp_vec
        }
    };
}

fn main() {
    let v = vec_custom!(10, 20, 30);
}
```

**Key Takeaway:** Declarative macros are excellent for variadic interfaces, repeating structures, and localized syntax abstractions. However, they are constrained by their purely pattern-matching nature. They cannot perform complex logic, inspect the internal structure of traits, or modify existing structs dynamically.

## Procedural Macros: Functions from Tokens to Tokens
When declarative macros aren't enough, we turn to Procedural Macros. A procedural macro is a Rust function that takes a `TokenStream` as input, executes arbitrary Rust code to analyze or mutate those tokens, and produces a new `TokenStream` as output. 

Because procedural macros run as compiler plugins, they can utilize crates like `syn` (to parse the `TokenStream` into an Abstract Syntax Tree) and `quote` (to easily generate new token streams).

There are three types of procedural macros:
1. **Custom `#[derive]` macros:** Used to automatically implement traits for structs or enums.
2. **Attribute-like macros:** Used to define custom attributes (e.g., `#[route(GET, "/")]`).
3. **Function-like macros:** Invoked like declarative macros (e.g., `sql!("SELECT * FROM users")`), but powered by procedural logic.

### Parsing the AST with `syn` and `quote`
To understand procedural macros, you must understand the interplay between `syn` and `quote`. The input token stream is a flat list of tokens, which is hard to analyze. The `syn` crate parses this stream into a structured Abstract Syntax Tree (AST). You can then traverse this tree, find the fields of a struct, inspect their types, and generate new code using the `quote` crate.

```rust
// A simplified example of a procedural derive macro
use proc_macro::TokenStream;
use quote::quote;
use syn::{parse_macro_input, DeriveInput};

#[proc_macro_derive(HelloMacro)]
pub fn hello_macro_derive(input: TokenStream) -> TokenStream {
    // Parse the token stream into an AST
    let ast = parse_macro_input!(input as DeriveInput);
    
    // Extract the name of the struct
    let name = &ast.ident;
    
    // Generate the new token stream
    let expanded = quote! {
        impl HelloMacro for #name {
            fn hello() {
                println!("Hello, my name is {}!", stringify!(#name));
            }
        }
    };
    
    // Return the generated tokens back to the compiler
    TokenStream::from(expanded)
}
```

## Summary
Rust macros offer a spectrum of metaprogramming capabilities. For localized syntax transformations and variadic parameters, declarative macros (`macro_rules!`) provide a lightweight, pattern-matching solution. For complex code generation, such as automated trait implementations or custom DSLs, procedural macros give you the full power of Rust to manipulate the Abstract Syntax Tree at compile time. By operating on token streams rather than raw text, both approaches maintain Rust's rigorous standards for safety and correctness.
