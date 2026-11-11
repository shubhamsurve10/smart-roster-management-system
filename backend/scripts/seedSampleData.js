import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

import Employee from "../models/Employee.js";
import Pod from "../models/Pod.js";
import Brand from "../models/Brand.js";
import Process from "../models/Process.js";
import Assignment from "../models/Assignment.js";
import WeeklyOffRule from "../models/WeeklyOffRule.js";
import Holiday from "../models/Holiday.js";
import Leave from "../models/Leave.js";
import CoverageOverride from "../models/CoverageOverride.js";

dotenv.config();

// Sample records are embedded from Smart_Roster_Sample_Dataset.xlsx.
// This script only upserts these sample records; it does not delete other data.
const sampleData = {
  "pods": [
    {
      "pod_name": "Pod Alpha",
      "pod_lead_employee_code": "E01"
    },
    {
      "pod_name": "Pod Bravo",
      "pod_lead_employee_code": "E07"
    },
    {
      "pod_name": "Pod Charlie",
      "pod_lead_employee_code": "E13"
    },
    {
      "pod_name": "Pod Delta",
      "pod_lead_employee_code": "E19"
    },
    {
      "pod_name": "Pod Echo",
      "pod_lead_employee_code": "E25"
    }
  ],
  "employees": [
    {
      "employee_code": "E01",
      "name": "Aarav Shah",
      "email": "e01@example.com",
      "temporary_password": "Roster@2026",
      "role": "pod_lead",
      "pod_name": "Pod Alpha",
      "active": true,
      "preferredOffDay_number": 0
    },
    {
      "employee_code": "E02",
      "name": "Diya Patel",
      "email": "e02@example.com",
      "temporary_password": "Roster@2026",
      "role": "agent",
      "pod_name": "Pod Alpha",
      "active": true,
      "preferredOffDay_number": 0
    },
    {
      "employee_code": "E03",
      "name": "Rohan Mehta",
      "email": "e03@example.com",
      "temporary_password": "Roster@2026",
      "role": "agent",
      "pod_name": "Pod Alpha",
      "active": true,
      "preferredOffDay_number": 0
    },
    {
      "employee_code": "E04",
      "name": "Anaya Rao",
      "email": "e04@example.com",
      "temporary_password": "Roster@2026",
      "role": "agent",
      "pod_name": "Pod Alpha",
      "active": true,
      "preferredOffDay_number": 0
    },
    {
      "employee_code": "E05",
      "name": "Vivaan Kapoor",
      "email": "e05@example.com",
      "temporary_password": "Roster@2026",
      "role": "agent",
      "pod_name": "Pod Alpha",
      "active": true,
      "preferredOffDay_number": 0
    },
    {
      "employee_code": "E06",
      "name": "Isha Nair",
      "email": "e06@example.com",
      "temporary_password": "Roster@2026",
      "role": "agent",
      "pod_name": "Pod Alpha",
      "active": true,
      "preferredOffDay_number": 0
    },
    {
      "employee_code": "E07",
      "name": "Kabir Desai",
      "email": "e07@example.com",
      "temporary_password": "Roster@2026",
      "role": "pod_lead",
      "pod_name": "Pod Bravo",
      "active": true,
      "preferredOffDay_number": 0
    },
    {
      "employee_code": "E08",
      "name": "Meera Iyer",
      "email": "e08@example.com",
      "temporary_password": "Roster@2026",
      "role": "agent",
      "pod_name": "Pod Bravo",
      "active": true,
      "preferredOffDay_number": 0
    },
    {
      "employee_code": "E09",
      "name": "Arjun Kulkarni",
      "email": "e09@example.com",
      "temporary_password": "Roster@2026",
      "role": "agent",
      "pod_name": "Pod Bravo",
      "active": true,
      "preferredOffDay_number": 0
    },
    {
      "employee_code": "E10",
      "name": "Sara Joshi",
      "email": "e10@example.com",
      "temporary_password": "Roster@2026",
      "role": "agent",
      "pod_name": "Pod Bravo",
      "active": true,
      "preferredOffDay_number": 0
    },
    {
      "employee_code": "E11",
      "name": "Reyansh Malhotra",
      "email": "e11@example.com",
      "temporary_password": "Roster@2026",
      "role": "agent",
      "pod_name": "Pod Bravo",
      "active": true,
      "preferredOffDay_number": 0
    },
    {
      "employee_code": "E12",
      "name": "Kiara Pillai",
      "email": "e12@example.com",
      "temporary_password": "Roster@2026",
      "role": "agent",
      "pod_name": "Pod Bravo",
      "active": true,
      "preferredOffDay_number": 0
    },
    {
      "employee_code": "E13",
      "name": "Aditya Verma",
      "email": "e13@example.com",
      "temporary_password": "Roster@2026",
      "role": "pod_lead",
      "pod_name": "Pod Charlie",
      "active": true,
      "preferredOffDay_number": 0
    },
    {
      "employee_code": "E14",
      "name": "Myra Bose",
      "email": "e14@example.com",
      "temporary_password": "Roster@2026",
      "role": "agent",
      "pod_name": "Pod Charlie",
      "active": true,
      "preferredOffDay_number": 0
    },
    {
      "employee_code": "E15",
      "name": "Ishaan Chopra",
      "email": "e15@example.com",
      "temporary_password": "Roster@2026",
      "role": "agent",
      "pod_name": "Pod Charlie",
      "active": true,
      "preferredOffDay_number": 0
    },
    {
      "employee_code": "E16",
      "name": "Aadhya Menon",
      "email": "e16@example.com",
      "temporary_password": "Roster@2026",
      "role": "agent",
      "pod_name": "Pod Charlie",
      "active": true,
      "preferredOffDay_number": 0
    },
    {
      "employee_code": "E17",
      "name": "Dev Sethi",
      "email": "e17@example.com",
      "temporary_password": "Roster@2026",
      "role": "agent",
      "pod_name": "Pod Charlie",
      "active": true,
      "preferredOffDay_number": 0
    },
    {
      "employee_code": "E18",
      "name": "Tara Das",
      "email": "e18@example.com",
      "temporary_password": "Roster@2026",
      "role": "agent",
      "pod_name": "Pod Charlie",
      "active": true,
      "preferredOffDay_number": 0
    },
    {
      "employee_code": "E19",
      "name": "Paddy Khan",
      "email": "e19@example.com",
      "temporary_password": "Roster@2026",
      "role": "pod_lead",
      "pod_name": "Pod Delta",
      "active": true,
      "preferredOffDay_number": 1
    },
    {
      "employee_code": "E20",
      "name": "Aman Gandhi",
      "email": "e20@example.com",
      "temporary_password": "Roster@2026",
      "role": "agent",
      "pod_name": "Pod Delta",
      "active": true,
      "preferredOffDay_number": 2
    },
    {
      "employee_code": "E21",
      "name": "Riya Bhat",
      "email": "e21@example.com",
      "temporary_password": "Roster@2026",
      "role": "agent",
      "pod_name": "Pod Delta",
      "active": true,
      "preferredOffDay_number": 3
    },
    {
      "employee_code": "E22",
      "name": "Neel Jain",
      "email": "e22@example.com",
      "temporary_password": "Roster@2026",
      "role": "agent",
      "pod_name": "Pod Delta",
      "active": true,
      "preferredOffDay_number": 4
    },
    {
      "employee_code": "E23",
      "name": "Sana Singh",
      "email": "e23@example.com",
      "temporary_password": "Roster@2026",
      "role": "agent",
      "pod_name": "Pod Delta",
      "active": true,
      "preferredOffDay_number": 5
    },
    {
      "employee_code": "E24",
      "name": "Yash Shetty",
      "email": "e24@example.com",
      "temporary_password": "Roster@2026",
      "role": "agent",
      "pod_name": "Pod Delta",
      "active": true,
      "preferredOffDay_number": 6
    },
    {
      "employee_code": "E25",
      "name": "Rahul Mishra",
      "email": "e25@example.com",
      "temporary_password": "Roster@2026",
      "role": "pod_lead",
      "pod_name": "Pod Echo",
      "active": true,
      "preferredOffDay_number": 1
    },
    {
      "employee_code": "E26",
      "name": "Aditi Reddy",
      "email": "e26@example.com",
      "temporary_password": "Roster@2026",
      "role": "agent",
      "pod_name": "Pod Echo",
      "active": true,
      "preferredOffDay_number": 2
    },
    {
      "employee_code": "E27",
      "name": "Karan Kaur",
      "email": "e27@example.com",
      "temporary_password": "Roster@2026",
      "role": "agent",
      "pod_name": "Pod Echo",
      "active": true,
      "preferredOffDay_number": 3
    },
    {
      "employee_code": "E28",
      "name": "Nisha Roy",
      "email": "e28@example.com",
      "temporary_password": "Roster@2026",
      "role": "agent",
      "pod_name": "Pod Echo",
      "active": true,
      "preferredOffDay_number": 4
    },
    {
      "employee_code": "E29",
      "name": "Varun Saxena",
      "email": "e29@example.com",
      "temporary_password": "Roster@2026",
      "role": "agent",
      "pod_name": "Pod Echo",
      "active": true,
      "preferredOffDay_number": 5
    },
    {
      "employee_code": "E30",
      "name": "Mira Dutta",
      "email": "e30@example.com",
      "temporary_password": "Roster@2026",
      "role": "agent",
      "pod_name": "Pod Echo",
      "active": true,
      "preferredOffDay_number": 6
    },
    {
      "employee_code": "E31",
      "name": "Tara Sethi",
      "email": "e31@example.com",
      "temporary_password": "Roster@2026",
      "role": "agent",
      "pod_name": "Pod Delta",
      "active": true,
      "preferredOffDay_number": 2
    },
    {
      "employee_code": "E32",
      "name": "Nikhil Bhatt",
      "email": "e32@example.com",
      "temporary_password": "Roster@2026",
      "role": "agent",
      "pod_name": "Pod Echo",
      "active": true,
      "preferredOffDay_number": 4
    },
    {
      "employee_code": "E33",
      "name": "Farhan Ali",
      "email": "e33@example.com",
      "temporary_password": "Roster@2026",
      "role": "agent",
      "pod_name": "Pod Echo",
      "active": false,
      "preferredOffDay_number": null
    }
  ],
  "brands": [
    {
      "brand_code": "B01",
      "brand_name": "Aster & Co"
    },
    {
      "brand_code": "B02",
      "brand_name": "BloomCart"
    },
    {
      "brand_code": "B03",
      "brand_name": "Cedar Living"
    },
    {
      "brand_code": "B04",
      "brand_name": "Dune Active"
    },
    {
      "brand_code": "B05",
      "brand_name": "EverGlow"
    },
    {
      "brand_code": "B06",
      "brand_name": "Fable Foods"
    },
    {
      "brand_code": "B07",
      "brand_name": "GlowNest"
    },
    {
      "brand_code": "B08",
      "brand_name": "Harbor Home"
    },
    {
      "brand_code": "B09",
      "brand_name": "Indigo Wear"
    },
    {
      "brand_code": "B10",
      "brand_name": "Juniper Baby"
    },
    {
      "brand_code": "B11",
      "brand_name": "Kite & Kind"
    },
    {
      "brand_code": "B12",
      "brand_name": "Luma Organics"
    },
    {
      "brand_code": "B13",
      "brand_name": "Mosaic Market"
    },
    {
      "brand_code": "B14",
      "brand_name": "Nectar Lane"
    },
    {
      "brand_code": "B15",
      "brand_name": "Olive Theory"
    },
    {
      "brand_code": "B16",
      "brand_name": "Pebble Play"
    },
    {
      "brand_code": "B17",
      "brand_name": "Quartz Care"
    },
    {
      "brand_code": "B18",
      "brand_name": "River & Root"
    },
    {
      "brand_code": "B19",
      "brand_name": "Solstice Skin"
    },
    {
      "brand_code": "B20",
      "brand_name": "Terra Threads"
    },
    {
      "brand_code": "B21",
      "brand_name": "Urban Sprout"
    },
    {
      "brand_code": "B22",
      "brand_name": "Velvet Pantry"
    },
    {
      "brand_code": "B23",
      "brand_name": "Kestrel Kids"
    },
    {
      "brand_code": "B24",
      "brand_name": "Lumen Labs"
    }
  ],
  "processes": [
    {
      "process_code": "B01-CS",
      "brand_code": "B01",
      "process_type": "CS",
      "calendarType": "NO_SUN_NO_HOLIDAY",
      "minStaff": 1
    },
    {
      "process_code": "B01-ACC",
      "brand_code": "B01",
      "process_type": "ACC",
      "calendarType": "NO_SUN_NO_HOLIDAY",
      "minStaff": 1
    },
    {
      "process_code": "B02-CS",
      "brand_code": "B02",
      "process_type": "CS",
      "calendarType": "NO_SUN_NO_HOLIDAY",
      "minStaff": 1
    },
    {
      "process_code": "B02-Retention",
      "brand_code": "B02",
      "process_type": "Retention",
      "calendarType": "NO_SUN_NO_HOLIDAY",
      "minStaff": 1
    },
    {
      "process_code": "B03-CS",
      "brand_code": "B03",
      "process_type": "CS",
      "calendarType": "NO_SUN_NO_HOLIDAY",
      "minStaff": 1
    },
    {
      "process_code": "B03-NDR",
      "brand_code": "B03",
      "process_type": "NDR",
      "calendarType": "NO_SUN_NO_HOLIDAY",
      "minStaff": 1
    },
    {
      "process_code": "B04-ACC",
      "brand_code": "B04",
      "process_type": "ACC",
      "calendarType": "NO_SUN_NO_HOLIDAY",
      "minStaff": 1
    },
    {
      "process_code": "B04-Retention",
      "brand_code": "B04",
      "process_type": "Retention",
      "calendarType": "NO_SUN_NO_HOLIDAY",
      "minStaff": 1
    },
    {
      "process_code": "B05-ACC",
      "brand_code": "B05",
      "process_type": "ACC",
      "calendarType": "NO_SUN_NO_HOLIDAY",
      "minStaff": 1
    },
    {
      "process_code": "B05-NDR",
      "brand_code": "B05",
      "process_type": "NDR",
      "calendarType": "NO_SUN_NO_HOLIDAY",
      "minStaff": 1
    },
    {
      "process_code": "B06-CS",
      "brand_code": "B06",
      "process_type": "CS",
      "calendarType": "NO_SUN_NO_HOLIDAY",
      "minStaff": 1
    },
    {
      "process_code": "B06-ACC",
      "brand_code": "B06",
      "process_type": "ACC",
      "calendarType": "NO_SUN_NO_HOLIDAY",
      "minStaff": 1
    },
    {
      "process_code": "B07-CS",
      "brand_code": "B07",
      "process_type": "CS",
      "calendarType": "NO_SUN_NO_HOLIDAY",
      "minStaff": 1
    },
    {
      "process_code": "B07-Retention",
      "brand_code": "B07",
      "process_type": "Retention",
      "calendarType": "NO_SUN_NO_HOLIDAY",
      "minStaff": 1
    },
    {
      "process_code": "B08-CS",
      "brand_code": "B08",
      "process_type": "CS",
      "calendarType": "NO_SUN_NO_HOLIDAY",
      "minStaff": 1
    },
    {
      "process_code": "B08-NDR",
      "brand_code": "B08",
      "process_type": "NDR",
      "calendarType": "NO_SUN_NO_HOLIDAY",
      "minStaff": 1
    },
    {
      "process_code": "B09-ACC",
      "brand_code": "B09",
      "process_type": "ACC",
      "calendarType": "NO_SUN_NO_HOLIDAY",
      "minStaff": 1
    },
    {
      "process_code": "B09-Retention",
      "brand_code": "B09",
      "process_type": "Retention",
      "calendarType": "NO_SUN_NO_HOLIDAY",
      "minStaff": 1
    },
    {
      "process_code": "B10-ACC",
      "brand_code": "B10",
      "process_type": "ACC",
      "calendarType": "NO_SUN_NO_HOLIDAY",
      "minStaff": 1
    },
    {
      "process_code": "B10-NDR",
      "brand_code": "B10",
      "process_type": "NDR",
      "calendarType": "NO_SUN_NO_HOLIDAY",
      "minStaff": 1
    },
    {
      "process_code": "B11-CS",
      "brand_code": "B11",
      "process_type": "CS",
      "calendarType": "NO_SUN_NO_HOLIDAY",
      "minStaff": 1
    },
    {
      "process_code": "B11-ACC",
      "brand_code": "B11",
      "process_type": "ACC",
      "calendarType": "NO_SUN_NO_HOLIDAY",
      "minStaff": 1
    },
    {
      "process_code": "B12-CS",
      "brand_code": "B12",
      "process_type": "CS",
      "calendarType": "NO_SUN_NO_HOLIDAY",
      "minStaff": 1
    },
    {
      "process_code": "B12-Retention",
      "brand_code": "B12",
      "process_type": "Retention",
      "calendarType": "NO_SUN_NO_HOLIDAY",
      "minStaff": 1
    },
    {
      "process_code": "B13-CS",
      "brand_code": "B13",
      "process_type": "CS",
      "calendarType": "NO_SUN_NO_HOLIDAY",
      "minStaff": 1
    },
    {
      "process_code": "B13-NDR",
      "brand_code": "B13",
      "process_type": "NDR",
      "calendarType": "NO_SUN_NO_HOLIDAY",
      "minStaff": 1
    },
    {
      "process_code": "B14-ACC",
      "brand_code": "B14",
      "process_type": "ACC",
      "calendarType": "NO_SUN_NO_HOLIDAY",
      "minStaff": 1
    },
    {
      "process_code": "B14-Retention",
      "brand_code": "B14",
      "process_type": "Retention",
      "calendarType": "NO_SUN_NO_HOLIDAY",
      "minStaff": 1
    },
    {
      "process_code": "B15-ACC",
      "brand_code": "B15",
      "process_type": "ACC",
      "calendarType": "NO_SUN_NO_HOLIDAY",
      "minStaff": 1
    },
    {
      "process_code": "B15-NDR",
      "brand_code": "B15",
      "process_type": "NDR",
      "calendarType": "NO_SUN_NO_HOLIDAY",
      "minStaff": 1
    },
    {
      "process_code": "B16-CS",
      "brand_code": "B16",
      "process_type": "CS",
      "calendarType": "NO_SUN_NO_HOLIDAY",
      "minStaff": 1
    },
    {
      "process_code": "B16-ACC",
      "brand_code": "B16",
      "process_type": "ACC",
      "calendarType": "NO_SUN_NO_HOLIDAY",
      "minStaff": 1
    },
    {
      "process_code": "B17-CS",
      "brand_code": "B17",
      "process_type": "CS",
      "calendarType": "NO_SUN_NO_HOLIDAY",
      "minStaff": 1
    },
    {
      "process_code": "B17-Retention",
      "brand_code": "B17",
      "process_type": "Retention",
      "calendarType": "NO_SUN_NO_HOLIDAY",
      "minStaff": 1
    },
    {
      "process_code": "B18-CS",
      "brand_code": "B18",
      "process_type": "CS",
      "calendarType": "NO_SUN_NO_HOLIDAY",
      "minStaff": 1
    },
    {
      "process_code": "B18-NDR",
      "brand_code": "B18",
      "process_type": "NDR",
      "calendarType": "NO_SUN_NO_HOLIDAY",
      "minStaff": 1
    },
    {
      "process_code": "B19-CS",
      "brand_code": "B19",
      "process_type": "CS",
      "calendarType": "ALL_365",
      "minStaff": 1
    },
    {
      "process_code": "B19-ACC",
      "brand_code": "B19",
      "process_type": "ACC",
      "calendarType": "ALL_365",
      "minStaff": 1
    },
    {
      "process_code": "B19-NDR",
      "brand_code": "B19",
      "process_type": "NDR",
      "calendarType": "ALL_365",
      "minStaff": 2
    },
    {
      "process_code": "B20-CS",
      "brand_code": "B20",
      "process_type": "CS",
      "calendarType": "EXCEPT_HOLIDAYS",
      "minStaff": 1
    },
    {
      "process_code": "B20-ACC",
      "brand_code": "B20",
      "process_type": "ACC",
      "calendarType": "EXCEPT_HOLIDAYS",
      "minStaff": 1
    },
    {
      "process_code": "B20-NDR",
      "brand_code": "B20",
      "process_type": "NDR",
      "calendarType": "EXCEPT_HOLIDAYS",
      "minStaff": 1
    },
    {
      "process_code": "B21-CS",
      "brand_code": "B21",
      "process_type": "CS",
      "calendarType": "NO_SUN_NO_HOLIDAY",
      "minStaff": 1
    },
    {
      "process_code": "B21-ACC",
      "brand_code": "B21",
      "process_type": "ACC",
      "calendarType": "NO_SUN_NO_HOLIDAY",
      "minStaff": 1
    },
    {
      "process_code": "B21-NDR",
      "brand_code": "B21",
      "process_type": "NDR",
      "calendarType": "NO_SUN_NO_HOLIDAY",
      "minStaff": 1
    },
    {
      "process_code": "B22-CS",
      "brand_code": "B22",
      "process_type": "CS",
      "calendarType": "ALL_365",
      "minStaff": 1
    },
    {
      "process_code": "B22-ACC",
      "brand_code": "B22",
      "process_type": "ACC",
      "calendarType": "EXCEPT_HOLIDAYS",
      "minStaff": 1
    },
    {
      "process_code": "B22-NDR",
      "brand_code": "B22",
      "process_type": "NDR",
      "calendarType": "NO_SUN_NO_HOLIDAY",
      "minStaff": 1
    },
    {
      "process_code": "B23-CS",
      "brand_code": "B23",
      "process_type": "CS",
      "calendarType": "ALL_365",
      "minStaff": 1
    },
    {
      "process_code": "B23-Retention",
      "brand_code": "B23",
      "process_type": "Retention",
      "calendarType": "NO_SUN_NO_HOLIDAY",
      "minStaff": 1
    },
    {
      "process_code": "B24-CS",
      "brand_code": "B24",
      "process_type": "CS",
      "calendarType": "ALL_365",
      "minStaff": 1
    }
  ],
  "assignments": [
    {
      "employee_code": "E01",
      "process_code": "B01-CS",
      "isPrimary": true
    },
    {
      "employee_code": "E01",
      "process_code": "B01-ACC",
      "isPrimary": false
    },
    {
      "employee_code": "E02",
      "process_code": "B02-CS",
      "isPrimary": true
    },
    {
      "employee_code": "E02",
      "process_code": "B02-Retention",
      "isPrimary": false
    },
    {
      "employee_code": "E03",
      "process_code": "B03-CS",
      "isPrimary": true
    },
    {
      "employee_code": "E03",
      "process_code": "B03-NDR",
      "isPrimary": false
    },
    {
      "employee_code": "E04",
      "process_code": "B04-ACC",
      "isPrimary": true
    },
    {
      "employee_code": "E04",
      "process_code": "B04-Retention",
      "isPrimary": false
    },
    {
      "employee_code": "E05",
      "process_code": "B05-ACC",
      "isPrimary": true
    },
    {
      "employee_code": "E05",
      "process_code": "B05-NDR",
      "isPrimary": false
    },
    {
      "employee_code": "E06",
      "process_code": "B06-CS",
      "isPrimary": true
    },
    {
      "employee_code": "E06",
      "process_code": "B06-ACC",
      "isPrimary": false
    },
    {
      "employee_code": "E07",
      "process_code": "B07-CS",
      "isPrimary": true
    },
    {
      "employee_code": "E07",
      "process_code": "B07-Retention",
      "isPrimary": false
    },
    {
      "employee_code": "E08",
      "process_code": "B08-CS",
      "isPrimary": true
    },
    {
      "employee_code": "E08",
      "process_code": "B08-NDR",
      "isPrimary": false
    },
    {
      "employee_code": "E09",
      "process_code": "B09-ACC",
      "isPrimary": true
    },
    {
      "employee_code": "E09",
      "process_code": "B09-Retention",
      "isPrimary": false
    },
    {
      "employee_code": "E10",
      "process_code": "B10-ACC",
      "isPrimary": true
    },
    {
      "employee_code": "E10",
      "process_code": "B10-NDR",
      "isPrimary": false
    },
    {
      "employee_code": "E11",
      "process_code": "B11-CS",
      "isPrimary": true
    },
    {
      "employee_code": "E11",
      "process_code": "B11-ACC",
      "isPrimary": false
    },
    {
      "employee_code": "E12",
      "process_code": "B12-CS",
      "isPrimary": true
    },
    {
      "employee_code": "E12",
      "process_code": "B12-Retention",
      "isPrimary": false
    },
    {
      "employee_code": "E13",
      "process_code": "B13-CS",
      "isPrimary": true
    },
    {
      "employee_code": "E13",
      "process_code": "B13-NDR",
      "isPrimary": false
    },
    {
      "employee_code": "E14",
      "process_code": "B14-ACC",
      "isPrimary": true
    },
    {
      "employee_code": "E14",
      "process_code": "B14-Retention",
      "isPrimary": false
    },
    {
      "employee_code": "E15",
      "process_code": "B15-ACC",
      "isPrimary": true
    },
    {
      "employee_code": "E15",
      "process_code": "B15-NDR",
      "isPrimary": false
    },
    {
      "employee_code": "E16",
      "process_code": "B16-CS",
      "isPrimary": true
    },
    {
      "employee_code": "E16",
      "process_code": "B16-ACC",
      "isPrimary": false
    },
    {
      "employee_code": "E17",
      "process_code": "B17-CS",
      "isPrimary": true
    },
    {
      "employee_code": "E17",
      "process_code": "B17-Retention",
      "isPrimary": false
    },
    {
      "employee_code": "E18",
      "process_code": "B18-CS",
      "isPrimary": true
    },
    {
      "employee_code": "E18",
      "process_code": "B18-NDR",
      "isPrimary": false
    },
    {
      "employee_code": "E19",
      "process_code": "B19-CS",
      "isPrimary": true
    },
    {
      "employee_code": "E21",
      "process_code": "B19-CS",
      "isPrimary": false
    },
    {
      "employee_code": "E19",
      "process_code": "B19-ACC",
      "isPrimary": false
    },
    {
      "employee_code": "E20",
      "process_code": "B19-ACC",
      "isPrimary": false
    },
    {
      "employee_code": "E20",
      "process_code": "B19-NDR",
      "isPrimary": false
    },
    {
      "employee_code": "E21",
      "process_code": "B19-NDR",
      "isPrimary": false
    },
    {
      "employee_code": "E22",
      "process_code": "B20-CS",
      "isPrimary": true
    },
    {
      "employee_code": "E24",
      "process_code": "B20-CS",
      "isPrimary": false
    },
    {
      "employee_code": "E22",
      "process_code": "B20-ACC",
      "isPrimary": false
    },
    {
      "employee_code": "E23",
      "process_code": "B20-ACC",
      "isPrimary": false
    },
    {
      "employee_code": "E23",
      "process_code": "B20-NDR",
      "isPrimary": false
    },
    {
      "employee_code": "E24",
      "process_code": "B20-NDR",
      "isPrimary": false
    },
    {
      "employee_code": "E25",
      "process_code": "B21-CS",
      "isPrimary": true
    },
    {
      "employee_code": "E26",
      "process_code": "B21-CS",
      "isPrimary": false
    },
    {
      "employee_code": "E26",
      "process_code": "B21-ACC",
      "isPrimary": false
    },
    {
      "employee_code": "E27",
      "process_code": "B21-ACC",
      "isPrimary": false
    },
    {
      "employee_code": "E25",
      "process_code": "B21-NDR",
      "isPrimary": false
    },
    {
      "employee_code": "E27",
      "process_code": "B21-NDR",
      "isPrimary": false
    },
    {
      "employee_code": "E28",
      "process_code": "B22-CS",
      "isPrimary": true
    },
    {
      "employee_code": "E30",
      "process_code": "B22-CS",
      "isPrimary": false
    },
    {
      "employee_code": "E28",
      "process_code": "B22-ACC",
      "isPrimary": false
    },
    {
      "employee_code": "E29",
      "process_code": "B22-ACC",
      "isPrimary": false
    },
    {
      "employee_code": "E29",
      "process_code": "B22-NDR",
      "isPrimary": false
    },
    {
      "employee_code": "E30",
      "process_code": "B22-NDR",
      "isPrimary": false
    },
    {
      "employee_code": "E19",
      "process_code": "B19-NDR",
      "isPrimary": false
    },
    {
      "employee_code": "E31",
      "process_code": "B23-CS",
      "isPrimary": true
    },
    {
      "employee_code": "E32",
      "process_code": "B23-CS",
      "isPrimary": false
    },
    {
      "employee_code": "E32",
      "process_code": "B23-Retention",
      "isPrimary": true
    },
    {
      "employee_code": "E31",
      "process_code": "B24-CS",
      "isPrimary": true
    },
    {
      "employee_code": "E33",
      "process_code": "B20-CS",
      "isPrimary": false
    }
  ],
  "weeklyOffRules": [
    {
      "employee_code": "E01",
      "weekday": 0,
      "type": "FIXED"
    },
    {
      "employee_code": "E02",
      "weekday": 0,
      "type": "FIXED"
    },
    {
      "employee_code": "E03",
      "weekday": 0,
      "type": "FIXED"
    },
    {
      "employee_code": "E04",
      "weekday": 0,
      "type": "FIXED"
    },
    {
      "employee_code": "E05",
      "weekday": 0,
      "type": "FIXED"
    },
    {
      "employee_code": "E06",
      "weekday": 0,
      "type": "FIXED"
    },
    {
      "employee_code": "E07",
      "weekday": 0,
      "type": "FIXED"
    },
    {
      "employee_code": "E08",
      "weekday": 0,
      "type": "FIXED"
    },
    {
      "employee_code": "E09",
      "weekday": 0,
      "type": "FIXED"
    },
    {
      "employee_code": "E10",
      "weekday": 0,
      "type": "FIXED"
    },
    {
      "employee_code": "E11",
      "weekday": 0,
      "type": "FIXED"
    },
    {
      "employee_code": "E12",
      "weekday": 0,
      "type": "FIXED"
    },
    {
      "employee_code": "E13",
      "weekday": 0,
      "type": "FIXED"
    },
    {
      "employee_code": "E14",
      "weekday": 0,
      "type": "FIXED"
    },
    {
      "employee_code": "E15",
      "weekday": 0,
      "type": "FIXED"
    },
    {
      "employee_code": "E16",
      "weekday": 0,
      "type": "FIXED"
    },
    {
      "employee_code": "E17",
      "weekday": 0,
      "type": "FIXED"
    },
    {
      "employee_code": "E18",
      "weekday": 0,
      "type": "FIXED"
    },
    {
      "employee_code": "E19",
      "weekday": 1,
      "type": "PREFERRED"
    },
    {
      "employee_code": "E20",
      "weekday": 2,
      "type": "PREFERRED"
    },
    {
      "employee_code": "E21",
      "weekday": 3,
      "type": "PREFERRED"
    },
    {
      "employee_code": "E22",
      "weekday": 4,
      "type": "PREFERRED"
    },
    {
      "employee_code": "E23",
      "weekday": 5,
      "type": "PREFERRED"
    },
    {
      "employee_code": "E24",
      "weekday": 6,
      "type": "PREFERRED"
    },
    {
      "employee_code": "E25",
      "weekday": 1,
      "type": "PREFERRED"
    },
    {
      "employee_code": "E26",
      "weekday": 2,
      "type": "PREFERRED"
    },
    {
      "employee_code": "E27",
      "weekday": 3,
      "type": "PREFERRED"
    },
    {
      "employee_code": "E28",
      "weekday": 4,
      "type": "PREFERRED"
    },
    {
      "employee_code": "E29",
      "weekday": 5,
      "type": "PREFERRED"
    },
    {
      "employee_code": "E30",
      "weekday": 6,
      "type": "PREFERRED"
    },
    {
      "employee_code": "E31",
      "weekday": 2,
      "type": "PREFERRED"
    },
    {
      "employee_code": "E32",
      "weekday": 4,
      "type": "PREFERRED"
    }
  ],
  "holidays": [
    {
      "date": "2026-11-08",
      "name": "Diwali"
    },
    {
      "date": "2026-12-25",
      "name": "Christmas Day"
    },
    {
      "date": "2026-12-31",
      "name": "Year-End Company Holiday"
    },
    {
      "date": "2027-01-26",
      "name": "Republic Day"
    }
  ],
  "leaves": [
    {
      "employee_code": "E19",
      "startDate": "2026-12-10",
      "endDate": "2026-12-10",
      "type": "LEAVE",
      "status": "APPROVED"
    },
    {
      "employee_code": "E22",
      "startDate": "2026-12-16",
      "endDate": "2026-12-16",
      "type": "COMP_OFF",
      "status": "APPROVED"
    },
    {
      "employee_code": "E31",
      "startDate": "2026-12-18",
      "endDate": "2026-12-18",
      "type": "LEAVE",
      "status": "PENDING"
    }
  ],
  "coverageOverrides": [
    {
      "process_code": "B19-CS",
      "date": "2026-12-15",
      "weekday": null,
      "minStaff": 2
    },
    {
      "process_code": "B20-ACC",
      "date": null,
      "weekday": 5,
      "minStaff": 2
    }
  ]
};

const upsert = async (Model, filter, fields) => {
  return Model.findOneAndUpdate(
    filter,
    { $set: fields },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
};

const seedSampleData = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing from backend/.env");
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB.");

    // Safety check: never alter an existing admin account.
    const sampleEmails = sampleData.employees.map((row) => row.email.trim().toLowerCase());
    const adminConflict = await Employee.findOne({
      email: { $in: sampleEmails },
      role: "admin",
    }).select("email");
    if (adminConflict) {
      throw new Error(`Sample email ${adminConflict.email} already belongs to an admin account. Rename that sample email before importing.`);
    }

    // 1. Employees are created first without pod references.
    const employeeByCode = new Map();
    for (const row of sampleData.employees) {
      const email = row.email.trim().toLowerCase();
      const hashedPassword = await bcrypt.hash(row.temporary_password, 12);
      const employee = await Employee.findOneAndUpdate(
        { email },
        {
          $set: {
            name: row.name,
            role: row.role,
            active: row.active,
            preferredOffDay: row.preferredOffDay_number,
          },
          // Existing passwords are never overwritten on a rerun.
          $setOnInsert: { password: hashedPassword, pod: null },
        },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
      );
      employeeByCode.set(row.employee_code, employee);
    }

    // 2. Brands.
    const brandByCode = new Map();
    for (const row of sampleData.brands) {
      const brand = await upsert(Brand, { name: row.brand_name }, { name: row.brand_name });
      brandByCode.set(row.brand_code, brand);
    }

    // 3. Pods and their lead references, then assign employees to pods.
    const podByName = new Map();
    for (const row of sampleData.pods) {
      const lead = employeeByCode.get(row.pod_lead_employee_code);
      if (!lead) throw new Error(`Pod lead not found: ${row.pod_lead_employee_code}`);
      const pod = await upsert(Pod, { name: row.pod_name }, { name: row.pod_name, lead: lead._id });
      podByName.set(row.pod_name, pod);
    }

    for (const row of sampleData.employees) {
      const employee = employeeByCode.get(row.employee_code);
      const pod = podByName.get(row.pod_name);
      if (!pod) throw new Error(`Pod not found for employee ${row.employee_code}: ${row.pod_name}`);
      await Employee.updateOne({ _id: employee._id }, { $set: { pod: pod._id } }, { runValidators: true });
    }

    // 4. Processes, keyed by brand + process type.
    const processByCode = new Map();
    for (const row of sampleData.processes) {
      const brand = brandByCode.get(row.brand_code);
      if (!brand) throw new Error(`Brand not found: ${row.brand_code}`);
      const process = await upsert(
        Process,
        { brand: brand._id, type: row.process_type },
        {
          brand: brand._id,
          type: row.process_type,
          calendarType: row.calendarType,
          minStaff: row.minStaff,
        }
      );
      processByCode.set(row.process_code, process);
    }

    // 5. Employee-to-process assignments.
    for (const row of sampleData.assignments) {
      const employee = employeeByCode.get(row.employee_code);
      const process = processByCode.get(row.process_code);
      if (!employee || !process) throw new Error(`Invalid assignment: ${row.employee_code} / ${row.process_code}`);
      await upsert(
        Assignment,
        { employee: employee._id, process: process._id },
        { employee: employee._id, process: process._id, isPrimary: row.isPrimary }
      );
    }

    // 6. Weekly-off rules.
    for (const row of sampleData.weeklyOffRules) {
      const employee = employeeByCode.get(row.employee_code);
      if (!employee) throw new Error(`Employee not found for weekly-off rule: ${row.employee_code}`);
      await upsert(
        WeeklyOffRule,
        { employee: employee._id, weekday: row.weekday },
        { employee: employee._id, weekday: row.weekday, type: row.type }
      );
    }

    // 7. Holidays.
    for (const row of sampleData.holidays) {
      await upsert(Holiday, { date: row.date }, { date: row.date, name: row.name });
    }

    // 8. Leaves and comp-offs.
    for (const row of sampleData.leaves) {
      const employee = employeeByCode.get(row.employee_code);
      if (!employee) throw new Error(`Employee not found for leave: ${row.employee_code}`);
      await upsert(
        Leave,
        { employee: employee._id, startDate: row.startDate, endDate: row.endDate, type: row.type },
        {
          employee: employee._id,
          startDate: row.startDate,
          endDate: row.endDate,
          type: row.type,
          status: row.status,
        }
      );
    }

    // 9. Process-specific coverage overrides (date OR weekday).
    for (const row of sampleData.coverageOverrides) {
      const process = processByCode.get(row.process_code);
      if (!process) throw new Error(`Process not found for coverage override: ${row.process_code}`);
      const hasDate = Boolean(row.date);
      const filter = hasDate
        ? { process: process._id, date: row.date }
        : { process: process._id, weekday: row.weekday };
      const fields = {
        process: process._id,
        minStaff: row.minStaff,
        ...(hasDate ? { date: row.date } : { weekday: row.weekday }),
      };
      await upsert(CoverageOverride, filter, fields);
    }

    console.log("\nSample dataset imported successfully:");
    console.log(`Employees: ${sampleData.employees.length}`);
    console.log(`Pods: ${sampleData.pods.length}`);
    console.log(`Brands: ${sampleData.brands.length}`);
    console.log(`Processes: ${sampleData.processes.length}`);
    console.log(`Assignments: ${sampleData.assignments.length}`);
    console.log(`Weekly-off rules: ${sampleData.weeklyOffRules.length}`);
    console.log(`Holidays: ${sampleData.holidays.length}`);
    console.log(`Leaves/comp-offs: ${sampleData.leaves.length}`);
    console.log(`Coverage overrides: ${sampleData.coverageOverrides.length}`);
    console.log("\nDemo employee login password for newly created sample accounts: Roster@2026");
    console.log("Use this password only for the fictional demo accounts. Change it before any real use.");
    console.log("Existing employee passwords and the existing admin account are not changed.");
  } catch (error) {
    console.error("Sample data import failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

seedSampleData();
