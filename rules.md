rules:
  - Never create or modify backend code unless asked.
  - Only analyze and document what exists.
  - Always verify each route and schema from the code before describing it.
  - If an API or function is unclear, mark it as “Unclear” instead of guessing.
  - When describing endpoints, always include:
      • Method (GET, POST, PUT, DELETE)
      • Path
      • Input parameters (body/query)
      • Output (response)
      • Purpose / Example usage
  - Include all authentication or token mechanisms if present.
  - Generate an integration guide for frontend developers.
