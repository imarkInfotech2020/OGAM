Title: I open-sourced "AWS for AI." One docker compose for governed, compliant, auditable AI for your whole org. Gateway, guardrails, policies, observability, audit, etc — all wired together, built on open source.

Body:
Every piece you need to run AI in a company already exists as open source. A gateway to the models. Guardrails. PII masking. Policies. Evals. Audit. Lineage. Vector search. The problem was never the parts. It was wiring them into one thing that works — and keeping every team inside the rules.

So I wrote an application layer on top of the best open source frameworks and made sure they actually talk to each other. One docker compose up and you get:
- LiteLLM for the model gateway
— one OpenAI-compatible endpoint across any model, on-prem or cloud 
- LLM Guard + Presidio for guardrails 
— PII redaction, prompt-injection, toxicity, secrets 
- OpenBao for secrets 
- Langfuse for LLM observability and tracing 
- OpenSearch for audit + SIEM 
- Marquez for data lineage 
- Temporal for durable agent runs 
- Qdrant for vector search / RAG 
- Airbyte + dbt to move data, ClickHouse for the warehouse, Great Expectations for data quality 
- Kestra for orchestration, Ragas + Evidently for evals + drift

Then I built the part I think is the unlock: a lovable / bolt.new / replit.dev for your enterprise.

You set up a pipeline and RBAC once, and now every employee can just talk to the system and build apps that replicate their workflows — inside the rules you already set. 

Human-in-the-loop reviews, reports, and autonomous agents included. 

A tax analyst or a claims adjuster builds a real governed workflow in plain language, and it physically can't step outside the guardrails, policies, and audit you defined.

That's the whole idea: set your rules once, everyone builds governed AI on top.

It's OGAC (Off Grid AI Console) : https://github.com/off-grid-ai/console. 

There's a live read-only demo with two example tenants (a bank and an insurer) if you want to click around before cloning: onprem-console.getoffgridai.co