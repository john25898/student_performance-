import pandas as pd
import numpy as np

# Set random seed so we get the same "random" students every time
np.random.seed(42)
num_students = 5000

print("Generating 5,000 Meru University student records...")

data = {
    'Year_of_Study': np.random.choice([1, 2, 3, 4], num_students),
    'Previous_GPA': np.round(np.random.uniform(1.5, 4.0, num_students), 2),
    'Attendance_Percentage': np.random.randint(50, 100, num_students),
    'CAT_1_Score': np.random.randint(2, 16, num_students), # Out of 15
    'CAT_2_Score': np.random.randint(2, 16, num_students), # Out of 15
    'Assignment_Score': np.random.randint(1, 11, num_students) # Out of 10
}

df = pd.DataFrame(data)

# Calculate internal marks (out of 40)
df['Total_Internal_Marks'] = df['CAT_1_Score'] + df['CAT_2_Score'] + df['Assignment_Score']

# Generate a realistic final exam score (out of 60)
df['Final_Exam_Score'] = np.round((df['Total_Internal_Marks'] / 40) * 50 + np.random.normal(0, 5, num_students))
df['Final_Exam_Score'] = np.clip(df['Final_Exam_Score'], 0, 60)

# Total Score (out of 100)
df['Total_Score'] = df['Total_Internal_Marks'] + df['Final_Exam_Score']

# Label the Target: 1 if At Risk (Total Score < 40), 0 if Safe
df['At_Risk'] = df['Total_Score'].apply(lambda x: 1 if x < 40 else 0)

# Drop the Final Exam and Total Score (The AI must predict risk BEFORE the final exam)
df_training = df.drop(columns=['Final_Exam_Score', 'Total_Score'])

# Save to CSV in the same folder
df_training.to_csv('performance_data.csv', index=False)
print("Success! 'performance_data.csv' has been created.")