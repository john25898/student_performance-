import pandas as pd
from pycaret.classification import setup, compare_models, save_model, pull

# 1. Load your perfectly clean dataset
file_path = r"C:\Users\ADMIN\PycharmProjects\Student-Performance-Analysis-System\backend\app\ml\performance_data.csv"
columns = ["Year", "GPA", "Score", "Attendance", "Study_Hours", "Failures", "Credits", "At_Risk"]

print("Loading data into the PyCaret Engine...")
df = pd.read_csv(file_path, names=columns, skipinitialspace=True)
df = df.apply(pd.to_numeric, errors='coerce').dropna()

# 2. Initialize the PyCaret Production Environment
print("\nSetting up the MLOps Pipeline...")
clf_setup = setup(data=df, target='At_Risk', session_id=42, verbose=False)

# 3. The Arena: Find the best model for the system
print("\nTraining and evaluating algorithms. Please wait (this may take 1-3 minutes)...\n")
best_model = compare_models()

# 4. Print the leaderboard for your documentation
leaderboard = pull()
print("\n--- OFFICIAL MODEL LEADERBOARD ---")
print(leaderboard[['Model', 'Accuracy', 'AUC', 'Recall', 'Prec.', 'F1']])
print(f"\n🏆 The Champion Model is: {best_model.__class__.__name__}")

# 5. EXPORT THE ENTIRE PIPELINE FOR FASTAPI
export_path = r"C:\Users\ADMIN\PycharmProjects\Student-Performance-Analysis-System\backend\app\ml\production_risk_pipeline"
save_model(best_model, export_path)

print(f"\n✅ PyCaret Engine successfully built and saved to: {export_path}.pkl")