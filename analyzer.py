import pandas as pd

# 1. Define columns and load data
columns = [
    "Year", "GPA", "Score", "Attendance",
    "Study_Hours", "Failures", "Credits", "At_Risk"
]
file_path = r"C:\Users\ADMIN\PycharmProjects\Student-Performance-Analysis-System\backend\app\ml\performance_data.csv"

df = pd.read_csv(file_path, names=columns, skipinitialspace=True)
df = df.apply(pd.to_numeric, errors='coerce').dropna()

print("--- SYSTEM OVERVIEW ---")
print(f"Clean Student Records Analyzed: {len(df)}")

# 2. THE CORRELATION ENGINE
print("\n--- WHAT CAUSES A STUDENT TO BE AT RISK? ---")
# This calculates how strongly every column relates to the 'At_Risk' column
correlations = df.corr()['At_Risk'].sort_values(ascending=False)

# Drop the 'At_Risk' column itself from the results (since it perfectly correlates with itself)
correlations = correlations.drop('At_Risk')

print("Correlation scores (1.0 is a perfect match, -1.0 is a perfect opposite):")
for feature, score in correlations.items():
    print(f"{feature}: {score:.4f}")