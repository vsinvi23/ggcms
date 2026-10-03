---
title: "Terraform for_each and Dynamic Blocks: Avoiding count's Index-Shift Trap"
description: "Why Terraform's count-based loops trigger destructive resource recreation when a list item is removed, and how key-based for_each and dynamic blocks eliminate the problem for both top-level resources and repeated nested blocks."
type: "ARTICLE"
categorySlug: "cloud-platforms"
articleType: "HOW_TO"
tags:
  - "terraform"
  - "for-each"
  - "dynamic-blocks"
  - "hcl"
  - "infrastructure-as-code"
---

# Terraform for_each and Dynamic Blocks: Avoiding count's Index-Shift Trap

A team manages an AWS Security Group with `count` looping over a list of eight ingress rules. Someone needs to remove rule index 2 — an old, unused port — from the middle of the list. They delete the line and run `terraform plan`, expecting a one-line diff. Instead, the plan shows rules 3 through 8 being destroyed and recreated. Nothing about those six rules actually changed — but `count` addresses resources by their numeric index in the list, and removing an item shifts every subsequent index down by one, which Terraform reads as "the resource that used to be at index 3 is gone, and a new resource now exists at index 2." In a live security group, that plan briefly removes and re-adds rules governing production traffic — exactly the kind of "small change, big blast radius" mistake infrastructure-as-code is supposed to prevent, not cause.

## The Problem: count Addresses by Position, Not Identity

```text
--- Index-based count (fragile) ---
rule[0] -> ingress_rule_a
rule[1] -> ingress_rule_b   <- deleting this shifts [2] to [1], forcing a destroy/recreate
rule[2] -> ingress_rule_c
```

`count` is a plain integer — Terraform has no way to know that "the third item" and "the item that happens to now occupy index 2" aren't semantically the same thing after a deletion. Any insertion or removal in the middle of a `count`-driven list cascades into unrelated-looking destroy/recreate operations for every item after the change point.

## The Solution: Key-Based for_each

`for_each` addresses resources by a stable, unique key (usually a map key or a set of strings) instead of a numeric position. Deleting one key leaves every other key's resource completely untouched, because Terraform is tracking identity, not position.

```text
--- Key-based for_each (robust) ---
rule["ssh"]  -> ingress_rule_ssh
rule["http"] -> ingress_rule_http   <- deleting this leaves ssh and db untouched
rule["db"]   -> ingress_rule_db
```

There are two distinct places `for_each` and its close relative, the `dynamic` block, apply:

* **`for_each` on a top-level `resource` or `module` block** creates multiple independent resource instances, each addressed by its map key (e.g. `aws_instance.web["prod-a"]`).
* **A `dynamic` block inside a single resource** generates repeated *nested* configuration blocks (like `ingress`, `subnet`, or `route`) from a collection — used when the repetition happens inside one resource, not across separate resource instances.

## Implementation: A DRY Security Group Using Both Patterns

### Step 1: Model the Rules as a Map, Not a List

```hcl
# variables.tf
variable "firewall_rules" {
  description = "Ingress rules to provision, keyed by a stable name."
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
      description = "Admin SSH access from corporate network"
    }
    "http" = {
      port        = 80
      protocol    = "tcp"
      cidr_blocks = ["0.0.0.0/0"]
      description = "Public HTTP traffic"
    }
    "https" = {
      port        = 443
      protocol    = "tcp"
      cidr_blocks = ["0.0.0.0/0"]
      description = "Public HTTPS traffic"
    }
  }
}
```

The map key (`"ssh"`, `"http"`, `"https"`) is the stable identity Terraform will track — as long as the key doesn't change, that rule's identity is preserved regardless of what other keys are added or removed.

### Step 2: Use a `dynamic` Block to Expand the Map Into Nested `ingress` Blocks

```hcl
# main.tf
resource "aws_security_group" "web_firewall" {
  name        = "production-web-sg"
  description = "Dynamically generated security rules for the web tier"
  vpc_id      = "vpc-0abcde12345678"

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

  # A hardcoded egress block is fine — it isn't a repeating collection
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

Inside the `content` block, `ingress.key` and `ingress.value` refer to the current map entry — the `dynamic` block's own name (`ingress`) becomes the iterator variable name automatically, unless you override it with `iterator`.

### Step 3: Verify the Generated Plan

```bash
terraform init
terraform plan
```

```text
# aws_security_group.web_firewall will be created
  + resource "aws_security_group" "web_firewall" {
      + name    = "production-web-sg"
      + ingress = [
          + {
              + cidr_blocks = ["10.0.0.0/8"]
              + from_port   = 22
              + protocol    = "tcp"
              + to_port     = 22
              ...
            },
          + {
              + cidr_blocks = ["0.0.0.0/0"]
              + from_port   = 80
              + protocol    = "tcp"
              + to_port     = 80
              ...
            },
        ]
    }
```

Now, adding a fourth key to `firewall_rules` (say `"metrics"` on port 9100) produces a plan with exactly one new `ingress` addition — `ssh`, `http`, and `https` show zero changes, because their map keys never moved.

## Using for_each at the Resource Level (Not Just Inside One Resource)

The same map can drive genuinely separate resource instances, which is the right pattern when each "rule" needs to be its own resource rather than a nested block — for example, one `aws_security_group_rule` per entry instead of nested `ingress {}` blocks inside a single security group:

```hcl
resource "aws_security_group_rule" "ingress" {
  for_each = var.firewall_rules

  type              = "ingress"
  security_group_id = aws_security_group.web_firewall.id
  from_port         = each.value.port
  to_port           = each.value.port
  protocol          = each.value.protocol
  cidr_blocks       = each.value.cidr_blocks
  description       = each.value.description
}
```

Removing `"http"` from the map here destroys exactly `aws_security_group_rule.ingress["http"]` — `aws_security_group_rule.ingress["ssh"]` and `["https"]` are addressed by their own keys and are never touched.

## Conclusion

The rule of thumb: reach for `count` only when provisioning genuinely identical, interchangeable resources where item order truly doesn't matter (rare in practice); reach for `for_each` and `dynamic` blocks whenever a list of named, distinguishable things is being managed — firewall rules, path matchers, IAM bindings, subnet definitions. The map-key discipline costs a small amount of upfront schema design, and buys back the guarantee that removing one entry never cascades into an unrelated destroy-and-recreate of everything after it.
