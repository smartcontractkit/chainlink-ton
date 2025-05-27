# Dependency Analyzer

Given a circular dependency or conflicting imports, Tact compiler v1.6.5 will error on a repeated symbol, but doesn't provide much help on finding the problematic line. This is a tool that generates a dependency graph in mermaid syntax to visualize imports. It is helpful to identify erroneous imports leading to circular dependencies or conflicting symbols.

## Running

```bash
nix run .#dependency-analyzer
```
