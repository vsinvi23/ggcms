---
title: "Java Deserialization Attacks: From Gadget Chains to Remote Code Execution"
description: "How untrusted Java object deserialization turns readObject() into an RCE primitive via gadget chains, and how to lock it down with ObjectInputFilter, allow-lists, and format migration."
type: "ARTICLE"
categorySlug: "appsec-threats"
articleType: "GUIDE"
tags:
  - "deserialization"
  - "java"
  - "remote-code-execution"
  - "gadget-chains"
  - "objectinputstream"
---

# Java Deserialization Attacks: From Gadget Chains to Remote Code Execution

## The Problem

In Java application security, untrusted deserialization remains one of the most critical and devastating vectors, often culminating in Remote Code Execution (RCE). The fundamental vulnerability lies in the design of the standard Java Object Serialization framework (`java.io.ObjectInputStream`).

When an application invokes `ObjectInputStream.readObject()` on a byte stream provided by an external client, the Java Virtual Machine (JVM) reconstructs the entire serialized object graph in memory before the application can perform any type-checking or semantic validation. This "instantiation-first, validation-later" paradigm allows an attacker to construct a specialized payload containing nested object graphs — referred to as a **gadget chain**.

A gadget is a legitimate class present on the classpath (often from third-party libraries like Apache Commons Collections, Spring, or standard JDK classes) that overrides serialization-lifecycle methods such as `readObject()`, `readResolve()`, or `hashCode()`. When the JVM deserializes the stream, it automatically triggers these magic methods. By carefully chaining gadgets, an attacker can manipulate the execution flow to invoke reflection, instantiate arbitrary classes, and eventually call terminal sinks like `Runtime.getRuntime().exec()` or dynamic class-loading mechanisms.

---

## Technical Architecture & Gadget Chains

The deserialization attack pipeline is entirely passive from the perspective of active application logic; the compromise occurs within the plumbing of the JVM's runtime before your business controllers ever see the deserialized object.

### Deserialization Execution Flow

```
[ Untrusted Byte Stream ]
          |
          v
   ObjectInputStream
          |
          +--> 1. Read class descriptor & metadata
          +--> 2. Resolve class type on classpath (no type validation yet)
          +--> 3. Instantiate object instance (bypassing normal constructors)
          |
          v
   Magic Lifecycle Sinks Triggered
          |
          +--> readObject() in gadget class (e.g., BadGadget)
          |         |
          |         v (Payload chain starts executing)
          |     BadGadget.readObject() -> Map.get()
          |         |
          |         v
          |     LazyMap.get() -> Transformer.transform()
          |         |
          |         v
          |     InvokerTransformer.transform() -> Method.invoke()
          |         |
          +--------> [ Terminal Sink: Runtime.exec() / ProcessBuilder ] --> (SYSTEM COMPROMISE)
```

To secure this architecture, we must enforce a **look-ahead deserialization** or **filtering** strategy that intercepts the class-loading phase *before* instantiation occurs.

---

## Robust Defensive Implementation

The standard defensive pattern is to use Java's modern `ObjectInputFilter` API (introduced in JDK 9 and backported to JDK 8). Below is a production-grade implementation of a custom `SafeObjectInputStream` that enforces a strict allow-list filter. It permits only explicitly approved classes to be deserialized, completely neutralizing gadget chains.

```java
package com.serenya.security.deserialization;

import java.io.*;
import java.util.Set;
import java.util.HashSet;

/**
 * SafeObjectInputStream implements a look-ahead deserialization pattern.
 * It enforces a strict allow-list of allowed classes and rejects any unexpected types
 * before instantiation can occur, preventing gadget chain execution.
 */
public class SafeObjectInputStream extends ObjectInputStream {

    private final Set<String> allowList;

    /**
     * Initializes the safe stream with a strict allow-list of class names.
     *
     * @param in The underlying input stream containing serialized data.
     * @param allowedClasses Set of fully qualified class names permitted to deserialize.
     * @throws IOException If an I/O error occurs.
     */
    public SafeObjectInputStream(InputStream in, Set<String> allowedClasses) throws IOException {
        super(in);
        this.allowList = new HashSet<>(allowedClasses);
        // Ensure primitive arrays and wrapper classes are allowed if necessary
        this.allowList.add("[B"); // byte array
        this.allowList.add("[I"); // int array
        this.allowList.add("java.lang.String");
        this.allowList.add("java.lang.Integer");
        this.allowList.add("java.lang.Long");
        this.allowList.add("java.lang.Boolean");
    }

    /**
     * Overrides resolveClass to perform look-ahead class validation.
     * This hook executes BEFORE the JVM instantiates the class descriptor.
     */
    @Override
    protected Class<?> resolveClass(ObjectStreamClass desc) throws IOException, ClassNotFoundException {
        String className = desc.getName();

        // Enforce strict allow-list validation
        if (!allowList.contains(className)) {
            throw new SecurityException("Deserialization blocked: unauthorized class attempt: " + className);
        }

        return super.resolveClass(desc);
    }
}
```

### Modern Declarative Filter Configuration (Java 9+)

Rather than subclassing `ObjectInputStream`, the modern preferred architecture is to apply an `ObjectInputFilter` directly to standard streams or globally.

```java
package com.serenya.security.deserialization;

import java.io.InputStream;
import java.io.ObjectInputStream;
import java.io.ObjectInputFilter;

public class ModernDeserializationGuard {

    /**
     * Safely deserializes an object using modern declarative Java filters.
     */
    public static Object safeDeserialize(InputStream rawStream) throws Exception {
        ObjectInputStream ois = new ObjectInputStream(rawStream);

        // Define a strict filter pattern: allow only our specific DTO, and reject everything else (*)
        // maxdepth=2 ensures we don't suffer from resource exhaustion (DoS) via deep nesting
        ObjectInputFilter filter = ObjectInputFilter.Config.createFilter(
            "com.serenya.dto.SafeTransferDTO;java.lang.String;!*;maxdepth=2;maxarray=1000"
        );

        ois.setObjectInputFilter(filter);
        return ois.readObject();
    }
}
```

---

## Architectural Remediation Strategies

1. **Eliminate Java serialization entirely.** The absolute best defense is to transition away from native binary serialization formats. Replace `ObjectInputStream` with data-only transfer mechanisms such as JSON (via Jackson/Gson with strict type validation), Protocol Buffers, or FlatBuffers. These formats do not serialize behavior or executable structures, only pure data.
2. **Apply global JVM filters.** Define the global JVM property `jdk.serialFilter` in your launch configurations:
   `-Djdk.serialFilter=!org.apache.commons.collections.**;!org.springframework.**;!*`
3. **Minimize attack surface.** Run JVMs under strict, least-privilege service accounts, and block outbound TCP egress connections from the app tier to prevent gadget payloads from fetching secondary malware payloads (reverse shells / out-of-band exploits).
4. **Patch known gadget-source libraries.** Gadget chains rely on specific classes existing on the classpath (Commons Collections `InvokerTransformer`, Spring's `BeanFactory` lookups, etc.). Removing or upgrading these libraries shrinks the attacker's available gadget inventory even before a filter is applied.
