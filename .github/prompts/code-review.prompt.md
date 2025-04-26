# Code Review Guidelines

Your goal is to review NodeJS code
to ensure it meets high-quality standards and follows best practices.

## Ensure Code Quality

- Maintain consistent YAML indentation.
- Optimize for readability first, performance second.
- Use environment variables for configuration, never hardcode sensitive info.
- Write clean, documented, error-handling code with appropriate logging.

## Check for Linting and Formatting

- Ensure YAML files adhere to [.yamllint](../../.yamllint) rules.
- Ensure Markdown files adhere to [.markdownlint.yaml](../../.markdownlint.yaml) rules.

## Review Code Structure

- Ensure indentation is correct.
- Follow standard code structure for NodeJS projects.
- Use descriptive function names and include helpful comments.

## Ensure Proper Error Handling

- Write error-handling code with appropriate logging.
- Ensure tasks fail gracefully and provide meaningful error messages.

## Check for Dependencies

- Ensure all dependencies are listed in
  [.devcontainer/requirements.txt](../../.devcontainer/requirements.txt) and [requirements.yml](../../requirements.yml).
- Verify that the role does not have any missing dependencies.

## Review GitHub Actions

- Ensure GitHub Actions workflows are correctly configured to run pre-commit checks.
- Verify that the workflows cover all necessary validation steps.
- Check [.github/workflows/](../) directory for workflow configurations.

## Documentation

- Ensure the [README.md](../../README.md) file is up-to-date
  and provides clear instructions for installation, usage, and variables.
- Include any additional documentation as needed for clarity.
