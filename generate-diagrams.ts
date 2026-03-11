/**
 * Generate workflow diagrams
 * Dynamically discovers and creates Mermaid diagram files for all workflows
 */

import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { DatabaseContext } from './src/types/context';

// Set dummy OpenAI API key for diagram generation (not used, just needed for instantiation)
process.env.OPENAI_API_KEY = 'sk-dummy-key-for-diagram-generation';

// Mock database context for diagram generation
const mockContext: DatabaseContext = {
  mongoose: {} as any,
  mongooseConnection: {} as any,
  mssqlConnection: {} as any,
};

interface WorkflowDefinition {
  name: string;
  className: string;
  path: string;
  outputName: string;
}

// Define workflows to generate diagrams for
const WORKFLOWS: WorkflowDefinition[] = [
  {
    name: 'Analytics Workflow',
    className: 'AnalyticsWorkflow',
    path: './src/workflows/analytics',
    outputName: 'analytics-workflow',
  },
  // Add more workflows here as they are created
  // {
  //   name: 'Campaign Management Workflow',
  //   className: 'CampaignManagementWorkflow',
  //   path: './src/workflows/campaign-management',
  //   outputName: 'campaign-management-workflow',
  // },
];

async function generateDiagramForWorkflow(workflow: WorkflowDefinition, outputDir: string): Promise<void> {
  console.log(`📊 Generating ${workflow.name} diagram...`);
  
  try {
    // Dynamically import the workflow class
    const workflowModule = await import(workflow.path);
    const WorkflowClass = workflowModule[workflow.className];
    
    if (!WorkflowClass) {
      throw new Error(`Workflow class "${workflow.className}" not found in ${workflow.path}`);
    }
    
    // Instantiate workflow
    const workflowInstance = new WorkflowClass(mockContext);
    
    // Access the compiled graph (may be private, so use bracket notation)
    const graph = workflowInstance['compiledGraph'] || workflowInstance.compiledGraph;
    
    if (!graph) {
      throw new Error(`Could not access compiled graph for ${workflow.name}`);
    }
    
    // Get mermaid diagram
    const mermaidDiagram = graph.getGraph().drawMermaid();
    
    // Save as .mmd file
    const mermaidPath = join(outputDir, `${workflow.outputName}.mmd`);
    writeFileSync(mermaidPath, mermaidDiagram, 'utf-8');
    console.log(`  ✅ Saved Mermaid: ${mermaidPath}`);
    
  } catch (error) {
    console.error(`❌ Error generating ${workflow.name} diagram:`, error);
    throw error;
  }
}

async function generateDiagrams() {
  console.log('🎨 Generating workflow diagrams...\n');

  const outputDir = join(__dirname, 'diagrams');
  
  // Create diagrams directory if it doesn't exist
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
    console.log(`📁 Created directory: ${outputDir}\n`);
  }

  // Generate diagrams for all workflows
  let successCount = 0;
  let failureCount = 0;
  
  for (const workflow of WORKFLOWS) {
    try {
      await generateDiagramForWorkflow(workflow, outputDir);
      successCount++;
      console.log('');
    } catch (error) {
      failureCount++;
      console.error(`⚠️  Skipping ${workflow.name}\n`);
    }
  }

  // Summary
  console.log('─'.repeat(60));
  console.log(`✅ Successfully generated: ${successCount}/${WORKFLOWS.length} diagrams`);
  if (failureCount > 0) {
    console.log(`❌ Failed: ${failureCount}/${WORKFLOWS.length} diagrams`);
  }
  console.log(`\n📂 Diagrams saved to: ${outputDir}`);
  console.log('\n💡 To convert to PNG:');
  console.log('   1. Open https://mermaid.live');
  console.log('   2. Paste the .mmd file contents');
  console.log('   3. Click "Actions" → "PNG" to download');
  
  if (failureCount > 0) {
    process.exit(1);
  }
}

// Run the script
generateDiagrams().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
