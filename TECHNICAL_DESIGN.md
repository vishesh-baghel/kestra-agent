# Kestra Agent Template - Technical Design Document

## Project Overview

**Project Name**: Kestra Agent Template  
**Submission Target**: Mastra Templates Hackathon  
**Deadline**: August 8, 2025  
**Development Time**: 2-3 hours daily  

### Purpose
Create a Mastra template that integrates with Kestra orchestration platform, allowing non-technical users to generate, validate, and execute Kestra workflows through natural language prompts. This template will serve as both a learning tool and a time-saving template for the Mastra community.

## Problem Statement

Non-technical users struggle with:
- Writing complex YAML workflow files for Kestra
- Understanding Kestra's syntax and task types
- Validating workflow correctness before execution
- Debugging workflow errors
- Navigating between agent interface and Kestra UI

## Solution Architecture

### Core Components

#### 1. **Kestra Workflow Agent**
- **Role**: Main orchestrator that handles user prompts and coordinates workflow generation
- **Capabilities**:
  - Natural language processing for workflow requirements
  - Workflow explanation in simple terms
  - Error handling and iterative improvement
  - User interaction management

#### 2. **Custom Tools**
Three specialized tools to handle Kestra integration:

##### a) **KestraDocsTool**
- **Purpose**: Fetch correct YAML syntax and task documentation
- **Input**: Task type, plugin name, or general query
- **Output**: Relevant documentation, syntax examples, and best practices
- **Implementation**: Web scraping or API integration with Kestra docs

##### b) **ExecuteWorkflowTool**
- **Purpose**: Execute workflows in Kestra and validate YAML
- **Input**: YAML workflow definition, namespace, optional inputs
- **Output**: Execution ID, status, error messages, or success confirmation
- **Implementation**: REST API calls to Kestra instance

##### c) **WorkflowViewTool**
- **Purpose**: Generate Kestra UI URLs for workflow visualization
- **Input**: Execution ID, namespace, workflow ID
- **Output**: Direct links to topology view, execution details, logs
- **Implementation**: URL construction based on Kestra UI patterns

#### 3. **Mastra Workflow Integration**
Utilize Mastra workflows to create a deterministic process:

```
User Prompt → Workflow Generation → Validation → Execution → Feedback Loop
```

### System Architecture Diagram

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   User Input    │───▶│  Kestra Agent    │───▶│ Mastra Workflow │
│ (Natural Lang.) │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │   Custom Tools   │    │ Workflow Steps  │
                       │                  │    │                 │
                       │ • KestraDocsTool │    │ 1. Generate     │
                       │ • ExecuteTool    │    │ 2. Validate     │
                       │ • ViewTool       │    │ 3. Execute      │
                       └──────────────────┘    │ 4. Feedback     │
                                │              └─────────────────┘
                                ▼
                       ┌──────────────────┐
                       │  Kestra Instance │
                       │                  │
                       │ • REST API       │
                       │ • Workflow Exec  │
                       │ • UI Links       │
                       └──────────────────┘
```

## Implementation Plan

### Phase 1: Core Infrastructure (Day 1-2, ~4-6 hours)
**Priority**: Critical
**Deliverables**:
1. **Project Setup**
   - Initialize Mastra project structure
   - Configure dependencies (axios for HTTP, yaml parser)
   - Set up environment variables for Kestra instance

2. **Basic Tools Implementation**
   - `KestraDocsTool`: Basic web scraping for Kestra documentation
   - `ExecuteWorkflowTool`: REST API integration for workflow execution
   - `WorkflowViewTool`: URL generation for Kestra UI links

3. **Core Agent Setup**
   - Create `KestraAgent` with basic instructions
   - Integrate the three custom tools
   - Basic prompt handling and response generation

### Phase 2: Workflow Generation & Validation (Day 3-4, ~4-6 hours)
**Priority**: Critical
**Deliverables**:
1. **YAML Generation Logic**
   - Prompt analysis for workflow requirements
   - Template-based YAML generation
   - Common workflow patterns (data processing, API calls, notifications)

2. **Validation System**
   - YAML syntax validation
   - Kestra-specific validation rules
   - Error message parsing and user-friendly explanations

3. **Mastra Workflow Integration**
   - Create deterministic workflow for the generation process
   - Step-by-step validation and execution
   - Error handling and retry logic

### Phase 3: User Experience & Polish (Day 5, ~2-3 hours)
**Priority**: High
**Deliverables**:
1. **Enhanced User Interaction**
   - Better prompt understanding
   - Workflow explanation in simple terms
   - Interactive approval process

2. **Error Recovery**
   - Automatic error fixing based on Kestra API responses
   - Iterative improvement loop
   - User guidance for manual fixes

3. **Documentation & Examples**
   - README with setup instructions
   - Example prompts and workflows
   - Troubleshooting guide

## Technical Specifications

### Dependencies
```json
{
  "dependencies": {
    "@mastra/core": "^0.12.1",
    "@mastra/memory": "^0.12.0",
    "axios": "^1.6.0",
    "yaml": "^2.3.0",
    "zod": "^3.25.76"
  }
}
```

### Environment Variables
```env
KESTRA_BASE_URL=http://localhost:8100
OPENAI_API_KEY=your_openai_key
```

### Core Workflow Schema
```typescript
interface WorkflowGenerationStep {
  userPrompt: string;
  generatedYAML: string;
  validationErrors?: string[];
  executionId?: string;
  kestraUIUrl?: string;
  status: 'pending' | 'generated' | 'validated' | 'executed' | 'error';
}
```

## Value-Driven Feature Prioritization

### Core Features (Must-Have)
1. **Natural Language to YAML Conversion** - Core value proposition
2. **YAML Validation** - Prevents execution failures
3. **Workflow Execution** - Validates generated workflows
4. **Error Feedback Loop** - Ensures working workflows
5. **Kestra UI Integration** - Visual verification for users

### Enhanced Features (Should-Have)
1. **Workflow Templates** - Common patterns (ETL, API workflows, notifications)
2. **Interactive Approval** - User confirmation before execution
3. **Execution Monitoring** - Real-time status updates
4. **Workflow Explanation** - Simple language explanations

### Stretch Goals (Nice-to-Have)
1. **Workflow Versioning** - Track iterations and improvements
2. **Multi-step Workflows** - Complex orchestration patterns
3. **Custom Plugin Integration** - Support for custom Kestra plugins
4. **Workflow Scheduling** - Set up triggers and schedules
5. **Performance Analytics** - Execution time and resource usage

## Risk Assessment & Mitigation

### Technical Risks
1. **Kestra API Compatibility**
   - *Risk*: API changes or authentication issues
   - *Mitigation*: Use stable API endpoints, implement fallback mechanisms

2. **YAML Generation Accuracy**
   - *Risk*: Generated YAML may be syntactically correct but logically flawed
   - *Mitigation*: Extensive testing with common patterns, validation layers

3. **LLM Hallucination**
   - *Risk*: Agent may generate invalid Kestra syntax
   - *Mitigation*: Use documentation tool, implement validation checks

### Timeline Risks
1. **Limited Development Time**
   - *Risk*: 2-3 hours daily may not be sufficient
   - *Mitigation*: Focus on MVP features, defer stretch goals

2. **Integration Complexity**
   - *Risk*: Kestra integration may be more complex than expected
   - *Mitigation*: Start with simple workflows, build complexity gradually

## Success Metrics

### Functional Metrics
- [ ] Successfully generates valid YAML for 80% of common workflow patterns
- [ ] Executes workflows without errors in 90% of cases
- [ ] Provides helpful error messages and fixes for failed workflows
- [ ] Generates working Kestra UI links for all executions

### User Experience Metrics
- [ ] Non-technical users can create workflows without YAML knowledge
- [ ] Average workflow generation time < 2 minutes
- [ ] Clear explanations provided for all generated workflows
- [ ] Seamless transition between agent and Kestra UI

### Template Quality Metrics
- [ ] Complete documentation with setup instructions
- [ ] 5+ example workflows demonstrating different use cases
- [ ] Clean, maintainable code structure
- [ ] Proper error handling and logging

## Next Steps & Approval Required

### Immediate Actions Needed
1. **Confirm Kestra Instance Setup**
   - Do you have a local Kestra instance running?
   - What's the base URL and authentication method?

2. **Validate Technical Approach**
   - Approve the three-tool architecture
   - Confirm Mastra workflow integration approach
   - Agree on feature prioritization

3. **Environment Setup**
   - Confirm OpenAI API access for LLM calls
   - Validate development environment setup

### Confirmed Specifications
1. **Kestra Environment**: Local instance running on localhost:8100 (no authentication)
2. **Authentication**: No authentication required
3. **Workflow Complexity**: Simple workflows suitable as starting points for Mastra users
4. **Template Distribution**: Repository link shared with hackathon organizers

### Approved Specifications ✅
Confirmed requirements:
- [x] Architecture approach is sound (three-tool + Mastra workflow)
- [x] Feature prioritization aligns with vision
- [x] Timeline and scope are realistic for available time
- [x] Kestra running locally on localhost:8100 (no auth)
- [x] OpenAI API keys configured
- [x] Focus on simple workflows as starting points

**Implementation Status**: Ready to begin Phase 1 (Core Infrastructure)
