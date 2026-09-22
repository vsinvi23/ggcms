# Terraform DRY Scoping: for_each and Dynamic Blocks Explained

## The Problem: The Copy-Paste Nightmare of Cloud Infrastructure
As infrastructure scales, Terraform codebases frequently fall victim to copy-paste bloat. Consider provisioning an AWS Security Group that requires fifteen custom ingress rules, or a GCP load balancer requiring dozens of path matchers. Copypasting resource blocks or nesting static sub-blocks makes files unreadable, error-prone, and painful to maintain.

Developers often attempt to use the standard `count` parameter to loop over a list of configurations. However, `count` uses index-based reference. If you have a list of ten security rules and insert a new item at index 3, Terraform registers this change as a shift for every subsequent item in the list. This leads to destructive "destroy and recreate" plans for stable resources.

To maintain a clean, maintainable, and DRY (Don't Repeat Yourself) codebase, we need a way to dynamically generate nested blocks without sacrificing resource safety.

## Mental Model: count vs. for_each and Dynamic Blocks
The architectural shift relies on transitioning from lists to maps, and utilizing `dynamic` blocks inside resources.

```
--- Index-based count (Fragile) ---
rule[0] -> ingress_rule_a
rule[1] -> ingress_rule_b  (Deleting this shifts [2] to [1], triggering recreation)
rule[2] -> ingress_rule_c

--- Key-based for_each (Robust) ---
rule["ssh"]  -> ingress_rule_ssh
rule["http"] -> ingress_rule_http  (Deleting this leaves others completely untouched)
rule["db"]   -> ingress_rule_db
```

While `for_each` operates on top-level resource blocks to instantiate multiple standalone resources, the `dynamic` block is used *inside* a resource to dynamically generate repeating nested structures (like `ingress` blocks, `subnet` settings, or `route` definitions).

## The Architectural Solution: Key-Based Mapping
By structuring configuration inputs as structured maps of objects, we can use `for_each` for top-level resources and `dynamic` blocks for repeating internal elements. This ensures:
- **No shifts**: Adding or removing rules is keyed by unique names, so only the affected element is modified.
- **DRY Configurations**: A single resource block acts as a template, receiving data feeds from variables.

## Implementation: Building a DRY Security Group
The following Terraform configuration defines an AWS Security Group dynamically using complex variables and nested `dynamic` blocks.

### 1. Variables Definition (`variables.tf`)
We define a variable that holds a structured map of our security rules:

```hcl
variable "firewall_rules" {
  description = "A mapped configuration of ingress and egress rules to provision."
  type = map(object({
    port        = number
    protocol    = string
    cidr_blocks = list(string)
    description = string
  }))
  default = {
    "ssh" = {
      port        = 22
      protocol    = "tcp"
      cidr_blocks = ["10.0.0.0/8"]
      description = "Allow admin SSH access from corporate network"
    }
    "http" = {
      port        = 80
      protocol    = "tcp"
      cidr_blocks = ["0.0.0.0/0"]
      description = "Allow public HTTP traffic"
    }
    "https" = {
      port        = 443
      protocol    = "tcp"
      cidr_blocks = ["0.0.0.0/0"]
      description = "Allow public HTTPS traffic"
    }
  }
}
```

### 2. Staging the Dynamic Resource (`main.tf`)
Now we reference the variable map inside the resource block using a `dynamic` block.

```hcl
resource "aws_security_group" "web_firewall" {
  name        = "production-web-sg"
  description = "Dynamically generated security rules for web tier"
  vpc_id      = "vpc-0abcde12345678"

  # Dynamic block for repeating 'ingress' configurations
  dynamic "ingress" {
    for_each = var.firewall_rules
    
    content {
      description = ingress.value.description
      from_port   = ingress.value.port
      to_port     = ingress.value.port
      protocol    = ingress.value.protocol
      cidr_blocks = ingress.value.cidr_blocks
    }
  }

  # Hardcoded fallback egress block (standard practice)
  egress {
    from_port        = 0
    to_port          = 0
    protocol         = "-1"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  tags = {
    Environment = "Production"
    ManagedBy   = "Terraform"
  }
}
```

## Verification: Examining the Terraform Plan
Execute the initialization and generate an execution plan to verify the structure:

```bash
terraform init
terraform plan
```

The output plan shows three distinct ingress blocks generated cleanly within a single Security Group resource:
```text
# aws_security_group.web_firewall will be created
  + resource "aws_security_group" "web_firewall" {
      + name        = "production-web-sg"
      + ingress     = [
          + {
              + cidr_blocks = [ "10.0.0.0/8" ]
              + from_port   = 22
              + protocol    = "tcp"
              + to_port     = 22
              ...
            },
          + {
              + cidr_blocks = [ "0.0.0.0/0" ]
              + from_port   = 80
              + protocol    = "tcp"
              + to_port     = 80
              ...
            }
        ]
    }
```
If you add a new service key to the `firewall_rules` map later, Terraform will append exactly one ingress block without modifying or recreating the existing rules.
