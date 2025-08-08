# Kestra Agent Template

![Mastra Template](https://img.shields.io/badge/Mastra-Template-blue)
![License](https://img.shields.io/badge/license-MIT-green)

> Create, validate, and execute Kestra workflows through natural language prompts using Mastra agents.

## Demo

Check out the demo video showing the Kestra Agent in action:

[![Kestra Agent Demo](https://cdn.loom.com/sessions/thumbnails/211c293e489b47d8bfe5972edc7846a4-with-play.gif)](https://www.loom.com/share/211c293e489b47d8bfe5972edc7846a4?sid=7efd5018-444c-42ae-99d2-4832e05f3b46)(https://www.loom.com/share/211c293e489b47d8bfe5972edc7846a4?sid=dfc9ebee-d7cc-471d-8b35-beb1337524ee)

## Overview

The Kestra Agent Template enables users of all technical levels to create and manage data orchestration workflows using natural language. This template integrates Mastra's powerful AI agents with the Kestra orchestration platform to:

- Convert natural language descriptions into valid Kestra YAML flows
- Research best practices and correct syntax for workflow tasks
- Execute and validate workflows in your Kestra instance
- Generate direct links to the Kestra UI for workflow visualization
- Automatically fix errors and improve workflows based on feedback

Perfect for data engineers, analysts, and business users who want to automate data processes without mastering complex YAML syntax or orchestration concepts.

## Features

### Core Features

- **Natural Language to YAML Conversion**: Create complete Kestra workflows using conversational language
- **YAML Validation**: Ensure workflows are syntactically correct before execution
- **Workflow Execution**: Test and run workflows directly within Kestra
- **Error Feedback Loop**: Automatically detect and fix workflow issues
- **Kestra UI Integration**: Get direct links to view your workflows in the Kestra UI

### Key Components

- **Kestra Flow Design Agent**: Researches best practices and generates YAML flow definitions
- **Kestra Flow Execution Agent**: Creates, executes, and monitors flows in Kestra
- **Web Summarization Agent**: Provides efficient web content processing for research
- **Custom Tools**: Specialized tools for interacting with Kestra's API and documentation

## Requirements

- Node.js v20.9.0 or higher
- A running Kestra instance (local or remote)
- OpenAI API key
- Optional: Exa API key for enhanced web search capabilities

## Getting Started

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/vishesh-baghel/kestra-agent.git
   cd kestra-agent
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Set up environment variables:

   ```bash
   cp .env.example .env
   ```

4. Edit the `.env` file with your API keys and Kestra URL:
   ```
   OPENAI_API_KEY=your_openai_key
   DATABASE_URL=sqlite://kestra-agent.db
   EXA_API_KEY=your_exa_api_key
   KESTRA_BASE_URL=http://localhost:8080
   ```

### Running the Template

Start the development server:

```bash
pnpm dev
```

## Usage Examples

Here are some examples of prompts you can use with the Kestra Agent:

### Example 1: Create a simple "Hello World" flow

```
Create a simple hello world flow that logs a welcome message
```

### Example 2: Create a data processing flow

```
Create a flow that downloads data from an API every day and saves it to a PostgreSQL database
```

### Example 3: Fix an execution error

```
My flow is failing with a connection error to the database
```

### Example 4: Create a scheduled notification flow

```
Create a flow that sends an email notification with a report every Monday at 8am
```

### Example 5: Add error handling to a flow

```
Enhance my data-processing-flow with proper error handling and retry mechanisms
```

## Architecture

The template follows a multi-agent architecture with specialized responsibilities:

### Components:

1. **Agent Network**: Orchestrates the entire workflow creation process and coordinates all specialized agents
2. **Flow Design Agent**: Researches best practices and generates syntactically correct YAML flow definitions
3. **Flow Execution Agent**: Creates, executes, and monitors flows in Kestra with real-time feedback
4. **Web Summarization Agent**: Processes web content efficiently to support research needs

This design ensures each agent focuses on its specialized task while maintaining a seamless user experience.

## Configuration

### Environment Variables

| Variable          | Description                  | Required | Default                 |
| ----------------- | ---------------------------- | -------- | ----------------------- |
| `OPENAI_API_KEY`  | Your OpenAI API key          | Yes      | -                       |
| `DATABASE_URL`    | PostgreSQL connection string | Yes      | -                       |
| `EXA_API_KEY`     | Exa API key for web search   | No       | -                       |
| `KESTRA_BASE_URL` | URL to your Kestra instance  | Yes      | `http://localhost:8080` |

### PostgreSQL Database Setup with Supabase

For a quick and easy PostgreSQL database setup, you can use Supabase:

1. **Create a Supabase account**:
   - Visit [Supabase](https://supabase.com/) and sign up or log in
   - Create a new project

2. **Get your PostgreSQL connection string**:
   - Go to Project Settings > Database
   - Find the connection string under "Connection Pooling"
   - Copy the connection string that looks like: `postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-ID].supabase.co:5432/postgres`

3. **Update your .env file**:
   ```
   DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-ID].supabase.co:5432/postgres
   ```

This provides a fully managed PostgreSQL database that's perfect for this template without needing to set up a local database.

### Kestra Instance Setup

This template requires access to a running Kestra instance. You have several options:

1. **Run Kestra locally using Docker**:

   ```bash
   docker run --pull=always --rm -it -p 8080:8080 --user=root \
     -v /var/run/docker.sock:/var/run/docker.sock \
     -v /tmp:/tmp kestra/kestra:latest server local
   ```

2. **Use the Kestra Docker Compose setup**:
   - Clone the [Kestra repository](https://github.com/kestra-io/kestra)
   - Use the provided Docker Compose file: `docker-compose up`

3. **Connect to an existing Kestra instance** by setting the `KESTRA_BASE_URL`

For more information, visit the [Kestra GitHub repository](https://github.com/kestra-io/kestra)

## Customization

### Adding New Task Types

To add support for new Kestra task types:

1. Expand the plugin research capabilities in `kestra-flow-design-agent.ts`
2. Update the documentation parsing in `kestra-docs-tool.ts`

### Customizing Agent Behavior

Modify the agent instructions in:

- `src/mastra/agents/kestra-flow-design-agent.ts`
- `src/mastra/agents/kestra-flow-execution-agent.ts`
- `src/mastra/networks/kestra-agent-network.ts`

## Resources

- [Kestra Documentation](https://kestra.io/docs/)
- [Mastra Documentation](https://mastra.ai/)
- [Kestra Plugin List](https://kestra.io/plugins/)

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
