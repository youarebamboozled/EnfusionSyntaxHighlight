import * as fs from 'fs';
import * as path from 'path';

export interface ClassInfo {
  class_name: string;
  methods: string[];
}

export const loadClassData = (): ClassInfo[] => {
  const classData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/classes.json'), 'utf8'));
  return classData.classes;
};

export let enumsData: string[] = [];

export const loadEnumsData = (): void => {
    try {
      const filePath = path.join(__dirname, '../data/enums.json');
      const data = fs.readFileSync(filePath, 'utf8');
      const parsedData = JSON.parse(data);
      
      if (parsedData && Array.isArray(parsedData)) {
        enumsData = parsedData;
      } else {
        console.error('Invalid enums data structure in JSON file');
      }
    } catch (error) {
      console.error('Error loading enums data:', error);
    }
  };
  
  loadEnumsData();