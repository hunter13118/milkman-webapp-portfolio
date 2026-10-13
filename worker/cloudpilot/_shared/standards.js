// Compact enterprise standards corpus bundled into the edge function so Gemini
// can ground its synthesis. Mirrors infrastructure/standards/*.json. In a real
// deployment this would come from Discovery Engine; here it travels in-context.
export const STANDARDS = [
  { id: "SEC-001", severity: "BLOCK", title: "Encryption at rest", rule: "All stateful services must use Google-managed or customer-managed encryption keys." },
  { id: "SEC-004", severity: "BLOCK", title: "Database network isolation", rule: "Managed databases must disable public IPv4 and attach to a peered VPC." },
  { id: "SEC-009", severity: "WARN", title: "Edge WAF required", rule: "Internet-facing load balancers should attach a Cloud Armor policy with the baseline OWASP rule set." },
  { id: "IAM-002", severity: "BLOCK", title: "Least-privilege service accounts", rule: "Workloads run as dedicated service accounts. Primitive roles are prohibited." },
  { id: "IAM-007", severity: "WARN", title: "Key rotation", rule: "Service account keys older than 90 days must be rotated; prefer workload identity federation." },
  { id: "RES-002", severity: "WARN", title: "Recoverable delete windows", rule: "Stateful services enable point-in-time recovery and respect provider name-reservation windows." },
  { id: "RES-011", severity: "WARN", title: "Cold-start SLO", rule: "Latency-sensitive serverless workloads pin min_instances >= 1 to meet the 300ms p95 cold-start SLO." },
  { id: "NET-001", severity: "BLOCK", title: "Private services require a VPC", rule: "Any private-IP service requires an explicit VPC network resource in the same plan." },
  { id: "NAM-006", severity: "WARN", title: "Immutable resource naming", rule: "Resources with name-reservation semantics append a stable entropy suffix to avoid recreation collisions." },
  { id: "COST-003", severity: "WARN", title: "VM rightsizing", rule: "Compute Engine instances require an autoscaler or a documented rightsizing exemption." },
  { id: "COST-008", severity: "WARN", title: "Object lifecycle", rule: "Cloud Storage buckets define lifecycle rules transitioning objects to Nearline/Coldline within 90 days." },
];
