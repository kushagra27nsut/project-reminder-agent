import xlsx from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const today = new Date();

// Helper to get formatted dates relative to today
const getDateRelative = (daysOffset) => {
  const date = new Date(today);
  date.setDate(today.getDate() + daysOffset);
  return date.toISOString().split('T')[0];
};

const templateData = [
  {
    "Project Name": "Alpha Platform Redesign",
    "Start Date": getDateRelative(30), // Exactly 30 days away (will trigger 30-day reminder milestone!)
    "Description": "Revamp the customer portal to support glassmorphic design and responsive navigation."
  },
  {
    "Project Name": "Global Cloud Migration",
    "Start Date": getDateRelative(15), // Exactly 15 days away (will trigger 15-day reminder milestone!)
    "Description": "Migrate core microservices from legacy VM instance clusters to fully managed serverless hosting."
  },
  {
    "Project Name": "SOC2 Compliance Certification",
    "Start Date": getDateRelative(5), // Exactly 5 days away (will trigger 5-day reminder milestone!)
    "Description": "Final security verification audit with external inspectors."
  },
  {
    "Project Name": "Beta Launch Event",
    "Start Date": getDateRelative(45), // 45 days away (no immediate reminder, visible on timeline)
    "Description": "Public demonstration of the project reminder agent platform."
  }
];

const main = () => {
  const worksheet = xlsx.utils.json_to_sheet(templateData);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, "Upcoming Projects");
  
  const outputPath = path.join(__dirname, 'projects_sample.xlsx');
  xlsx.writeFile(workbook, outputPath);
  console.log(`Successfully created dynamic Excel template at: ${outputPath}`);
};

main();
