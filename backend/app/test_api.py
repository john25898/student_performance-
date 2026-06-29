import requests
import json

url = "http://127.0.0.1:8000/predict-risk"

# Data for a student who is clearly struggling
student_data = {
  "Year": 2,
  "GPA": 1.8,
  "Score": 40.0,
  "Attendance": 55.0,
  "Study_Hours": 2.0,
  "Failures": 1,
  "Credits": 15
}

print("Asking the AI for a prediction AND an explanation...\n")
response = requests.post(url, json=student_data)

# We use json.dumps to print the result neatly formatted
print(json.dumps(response.json(), indent=2))