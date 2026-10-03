---
title: "AWS Transit Gateway vs VPC Peering: Scaling Hub-and-Spoke Network Topologies"
description: "Why full-mesh VPC peering breaks down past a few dozen VPCs, and how AWS Transit Gateway's hub-and-spoke model plus per-attachment route tables solve routing sprawl, network segmentation, and hybrid connectivity."
type: "ARTICLE"
categorySlug: "cloud-platforms"
articleType: "GUIDE"
tags:
  - "aws"
  - "transit-gateway"
  - "vpc-peering"
  - "networking"
  - "terraform"
  - "hub-and-spoke"
---

# AWS Transit Gateway vs VPC Peering: Scaling Hub-and-Spoke Network Topologies

## The Problem: The Sprawl of VPC Peering Connections

As organizations mature in AWS, their cloud footprint expands from a single Virtual Private Cloud (VPC) to dozens or hundreds of VPCs across multiple accounts. To allow these microservices, databases, and shared services to communicate securely using private IP addresses, network engineers traditionally rely on **VPC Peering**.

VPC Peering creates a direct, one-to-one, private network connection between two VPCs. While incredibly performant and cost-effective for a small number of networks, it suffers from a fatal architectural flaw: **it is not transitive**.

If VPC A is peered with VPC B, and VPC B is peered with VPC C, VPC A *cannot* talk to VPC C through B. To allow full communication, you must create a direct peer between A and C. This results in a **full mesh topology**.

As the number of VPCs ($N$) grows, the number of required peering connections scales quadratically: $N \times (N-1) / 2$.

- 10 VPCs = 45 connections.
- 100 VPCs = 4,950 connections!

Managing routing tables, security groups, and cross-account permissions for thousands of distinct peering links becomes an operational nightmare, leading to routing errors, security vulnerabilities, and brittle automation.

## The Solution: AWS Transit Gateway (TGW)

AWS Transit Gateway solves the scalability nightmare by replacing the point-to-point mesh with a **hub-and-spoke topology**.

Transit Gateway acts as a highly scalable, centralized cloud router. Instead of peering every VPC to every other VPC, you simply attach each VPC (the "spokes") to the central Transit Gateway (the "hub").

### The Mental Model: The Central Post Office

**VPC Peering (full mesh)**: Every house in a city builds a private, physical underground tunnel to every other house they want to send mail to.

**Transit Gateway (hub and spoke)**: Every house builds exactly one road to the central post office. The post office looks at the address and routes the mail to the correct destination house.

```text
       [ VPC A ]                       [ VPC B ]
           \                               /
            \ (Attachment)      (Attachment)/
             \                           /
              +--> [ TRANSIT GATEWAY ] <--+
             /           (Routing Table)   \
            /                               \
           / (Attachment)        (Attachment)\
       [ VPC C ]                       [ VPN / Direct Connect ]
```

With Transit Gateway, 100 VPCs only require 100 attachments to the TGW, rather than 4,950 peering links. Furthermore, TGW simplifies hybrid connectivity. You can terminate an on-premises VPN or AWS Direct Connect into the TGW, instantly granting the on-premises datacenter access to all attached VPCs.

## Deep Dive: Routing in Transit Gateway

Unlike VPC Peering, which relies entirely on individual VPC routing tables, Transit Gateway possesses its own internal **TGW route tables**. This allows for incredibly powerful and complex traffic segmentation.

### Scenario: Network Isolation

Imagine you have Production VPCs, Development VPCs, and a Shared Services VPC (containing logging and directory services). You want:

1. Prod to talk to Shared Services.
2. Dev to talk to Shared Services.
3. Prod and Dev MUST NOT talk to each other.

With VPC Peering, ensuring Dev and Prod never peer relies on strict human governance. With Transit Gateway, you enforce this mathematically using multiple TGW route tables.

1. **Dev route table**: Attached to Dev VPCs. Contains routes to Shared Services. (No route to Prod).
2. **Prod route table**: Attached to Prod VPCs. Contains routes to Shared Services. (No route to Dev).
3. **Shared Services route table**: Attached to Shared VPC. Contains routes back to both Dev and Prod.

```text
   Dev VPCs ---attach---> [ Dev TGW Route Table ] ---route---> Shared Services VPC
   Prod VPCs --attach---> [ Prod TGW Route Table ] --route---> Shared Services VPC
   (No route entry exists from Dev RT to Prod VPC, or vice versa — isolation is structural, not a firewall rule)
```

### Configuring VPC Routing

Even with a TGW, you must still update the local routing table inside the individual VPCs to send traffic *to* the TGW.

```hcl
# Terraform Example: Routing 10.0.0.0/8 traffic from a VPC to the TGW
resource "aws_route" "vpc_to_tgw" {
  route_table_id         = aws_route_table.prod_private_rt.id
  destination_cidr_block = "10.0.0.0/8"
  transit_gateway_id     = aws_ec2_transit_gateway.main_tgw.id
}
```

## Cost and Performance Trade-offs

While Transit Gateway massively simplifies network management, it is not a silver bullet. Architects must weigh two critical factors:

1. **Cost**: VPC Peering charges standard cross-AZ data transfer rates. Transit Gateway introduces two new costs: an hourly fee per VPC attachment, AND a per-gigabyte data-processing fee for all traffic flowing through the TGW. For high-bandwidth, data-intensive workloads (e.g., massive Hadoop clusters replicating data between two specific VPCs), routing through TGW can become prohibitively expensive.
2. **Latency**: Because traffic hops through an intermediate routing layer, TGW introduces a slight latency penalty compared to the direct line-of-sight provided by VPC Peering.

## Key Takeaways

1. **VPC Peering does not transit** — a full mesh of $N$ VPCs needs $N(N-1)/2$ connections, which becomes unmanageable past a few dozen VPCs.
2. **Transit Gateway trades a flat per-attachment cost for hub-and-spoke simplicity** — $N$ VPCs need only $N$ attachments.
3. **Multiple TGW route tables enforce segmentation structurally**, not just via security group policy — Dev and Prod can be made mutually unreachable by simply never adding a route between their route tables.
4. **Use Transit Gateway as the default backbone**, and reserve point-to-point VPC Peering for specific high-bandwidth or ultra-low-latency links where the TGW's per-GB processing fee and extra hop are not worth paying.

VPC Peering and Transit Gateway are not mutually exclusive. The modern best practice is a hybrid approach — Transit Gateway for the architectural backbone, and VPC Peering for the rare pair of VPCs that need to bypass it entirely for cost or latency reasons.
