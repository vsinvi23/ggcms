# Building a Production-Grade Java Service from Scratch: Tomcat, Spring, and Fat JARs

## The Problem: The Legacy Application Server and WAR Deployment Anti-Pattern

In the early era of enterprise Java, deployment followed an architectural paradigm called "Application-Server-first." Developers built web archives (`.war` files) and handed them to operations teams to deploy onto massive, pre-configured application servers like WebLogic, JBoss, or standalone Tomcat instances.

This static hardware-centric architecture introduced severe friction:
1.  **Environment Mismatch**: The operations team managed the server configuration, Java runtime, and container library versions. Mismatches between local development Tomcat and staging WebLogic led to subtle, hard-to-debug runtime failures.
2.  **Resource Contention**: Multiple applications deployed to the same application server shared the same JVM process, resulting in single points of failure, memory leaks propagating across domains, and poor isolation.
3.  **Slow Scaling**: Scaling an application required cloning the entire, heavy-weight application server environment, taking minutes rather than seconds.

Cloud-native architecture demanded a shift to **self-contained micro-services**—the application must own its container, and the deployment artifact must be an executable "Fat JAR" containing both the compiled application code and the web server runtime.

---

## Architectural Deep-Dive: How Embedded Containers Work

Instead of deploying your application inside a container, you embed the container inside your application. The web server (e.g., Tomcat, Jetty, Undertow) becomes a library dependency managed in your `pom.xml` or `build.gradle`.

When the Java entry point `public static void main` executes, it instantiates the servlet engine programmatically, configures network ports, binds context paths, and maps servlet engines in memory.

### The Anatomy of an Executable Fat JAR

To execute a JAR via `java -jar app.jar`, the package must contain all external dependencies. However, standard Java class loaders cannot load classes from nested JAR files (i.e., jars inside jars) out of the box. 

Frameworks like Spring Boot bypass this JVM limitation using custom class loaders. Below is the structural layout of a standard Spring Boot executable JAR:

```
my-service.jar
├───META-INF/
│   └───MANIFEST.MF                 <-- Defines Main-Class as JarLauncher and Start-Class
├───org/
│   └───springframework/
│       └───boot/
│           └───loader/              <-- Custom Spring Boot classloader code (Launcher, JarURLConnection)
└───BOOT-INF/
    ├───classes/                     <-- Compiled application classes (.class files)
    └───lib/                         <-- Nested dependency JARs (including tomcat-embed-core.jar)
```

### The Fat JAR Bootstrap Lifecycle:
1.  The JVM reads `META-INF/MANIFEST.MF` and executes the configured `Main-Class`: `org.springframework.boot.loader.JarLauncher`.
2.  `JarLauncher` instantiates a custom `LaunchedURLClassLoader` that understands how to parse and load resources from nested paths under `BOOT-INF/classes` and `BOOT-INF/lib`.
3.  The custom loader locates the application's actual entry point defined under the `Start-Class` header (your Spring Boot application's main class) and invokes its `main` method via reflection.

---

## Concrete Code: Bootstrapping Tomcat Programmatically (Zero Spring Boot)

To demystify the magic of Spring Boot, we can write a production-ready Java service that bootstraps an embedded Tomcat container programmatically from a raw `main` method, with zero external framework dependencies other than the Tomcat API.

### 1. Maven Dependencies (Conceptual)
You would require `tomcat-embed-core` and `tomcat-embed-jasper` in your project dependencies.

### 2. Programmatic Tomcat Bootstrap Code

```java
import org.apache.catalina.Context;
import org.apache.catalina.LifecycleException;
import org.apache.catalina.startup.Tomcat;

import javax.servlet.ServletException;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.File;
import java.io.IOException;
import java.io.PrintWriter;

public class ProgrammaticServiceLauncher {

    public static void main(String[] args) throws LifecycleException {
        // Initialize the programmatic Tomcat container
        Tomcat tomcat = new Tomcat();
        
        // Configure the network interface
        int port = 8080;
        tomcat.setPort(port);
        tomcat.getConnector(); // Forces connector initialization

        // Define base and context paths
        String docBase = new File(".").getAbsolutePath();
        Context context = tomcat.addContext("", docBase);

        // Register custom servlets programmatically
        String apiServletName = "UserApiServlet";
        tomcat.addServlet("", apiServletName, new UserApiServlet());
        context.addServletMappingDecoded("/api/users/*", apiServletName);

        String healthServletName = "HealthCheckServlet";
        tomcat.addServlet("", healthServletName, new HealthCheckServlet());
        context.addServletMappingDecoded("/health", healthServletName);

        // Start the Tomcat engine
        System.out.println("Programmatic embedded Tomcat starting on port " + port);
        tomcat.start();
        
        // Prevent main thread from exiting immediately
        tomcat.getServer().await();
    }

    // A lightweight, thread-safe Custom Servlet
    private static class UserApiServlet extends HttpServlet {
        @Override
        protected void doGet(HttpServletRequest req, HttpServletResponse resp) 
                throws ServletException, IOException {
            resp.setContentType("application/json");
            resp.setCharacterEncoding("UTF-8");
            
            // Extract request paths safely
            String pathInfo = req.getPathInfo();
            PrintWriter out = resp.getWriter();

            if (pathInfo == null || pathInfo.equals("/")) {
                out.print("{\"users\": [{\"id\": 1, \"name\": \"Alice\"}, {\"id\": 2, \"name\": \"Bob\"}]}");
            } else if (pathInfo.equals("/1")) {
                out.print("{\"id\": 1, \"name\": \"Alice\", \"role\": \"Administrator\"}");
            } else {
                resp.setStatus(HttpServletResponse.SC_NOT_FOUND);
                out.print("{\"error\": \"User not found\"}");
            }
            out.flush();
        }
    }

    // Simple Health Check Endpoint
    private static class HealthCheckServlet extends HttpServlet {
        @Override
        protected void doGet(HttpServletRequest req, HttpServletResponse resp) 
                throws ServletException, IOException {
            resp.setContentType("application/json");
            resp.getWriter().print("{\"status\": \"UP\", \"database\": \"CONNECTED\"}");
        }
    }
}
```

### Architectural Realization:
Running this code initiates a fully operational Tomcat server listening on port 8080, entirely controlled and executed inside a standard Java process. Under the hood, this is the fundamental process that Spring Boot's `ServletWebServerApplicationContext` automates, removing the friction of servlet registration and container setup.
