# Copilot Instructions for infura-extract project

You are expected to be an expert in:

- NodeJS
- YAML

## Code Standards

- Avoid writing trailing whitespace
- Follow code formatting defined in [`.prettierrc`](./.prettierrc) file.
- Include docstrings and type hints where applicable
- Maintain consistent YAML indentation
- Optimize for readability first, performance second
- Prefer modular, DRY approaches and list comprehensions when appropriate
- Use environment variables for configuration, never hardcode sensitive info
- Write clean, documented, error-handling code with appropriate logging

## General Approach

- Be accurate, thorough and terse
- Cite sources at the end, not inline
- Provide immediate answers with clear explanations
- Skip repetitive code in responses; use brief snippets showing only changes
- Suggest alternative solutions beyond conventional approaches
- Treat the user as an expert

## YAML Guidelines

Ensure the following rules are strictly followed:

- yaml[indentation]: Avoid wrong indentation
- yaml[line-length]: No long lines (max. 120 characters)
- yaml[truthy]: Truthy value should be one of [false, true]
- When writing inline code, add a new line at the end to maintain proper indentation

## Project Specifics

This role installs and configures trading platform
which runs using wine and xvfb.

Notes:

- Project utilizes Codespaces with config file at .devcontainer/devcontainer.json
  and requirements at .devcontainer/requirements.txt
- GitHub Actions are used to validate the code by running
  pre-commit checks (see .pre-commit-config.yaml file).
- Formatting rules are defined in .yamllint (YAML) and .markdownlint.yaml (Markdown) files.

### Testing Approach

- Currently no tests are defined.
