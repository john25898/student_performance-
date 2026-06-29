import pandas as pd
from pycaret.classification import setup, compare_models


def run_sandbox():
    print("Loading Meru University Student Data...")
    df = pd.read_csv('performance_data.csv')

    print("Initializing PyCaret Sandbox Environment...")
    clf_setup = setup(data=df, target='At_Risk', session_id=42, verbose=False)

    print("Training and comparing Machine Learning models...")
    print("Please wait, this will take about 1-2 minutes...\n")

    best_model = compare_models()

    print("\n========================================================")
    print("🏆 THE MATHEMATICAL WINNER FOR OUR SYSTEM IS:")
    print(best_model)
    print("========================================================")


if __name__ == "__main__":
    run_sandbox()