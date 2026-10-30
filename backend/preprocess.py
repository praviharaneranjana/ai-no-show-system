import argparse

import pandas as pd

def preprocess_data(input_path: str = "data/KaggleV2-May-2016.csv"):
    print(f"Loading dataset from {input_path}...")
    df = pd.read_csv(input_path)
    
    # Basic cleaning
    df = df.drop(['AppointmentID'], axis=1)
    df['No-show'] = df['No-show'].map({'No': 0, 'Yes': 1})
    df['Age'] = df['Age'].clip(lower=0, upper=100)
    
    # Convert to datetime properly
    df['ScheduledDay'] = pd.to_datetime(df['ScheduledDay']).dt.normalize()
    df['AppointmentDay'] = pd.to_datetime(df['AppointmentDay']).dt.normalize()
    
    # Feature Engineering
    df['DaysAhead'] = (df['AppointmentDay'] - df['ScheduledDay']).dt.days
    df['DaysAhead'] = df['DaysAhead'].clip(lower=0)
    
    df['DayOfWeek'] = df['AppointmentDay'].dt.weekday
    df['IsWeekend'] = df['DayOfWeek'] >= 5
    df['Month'] = df['AppointmentDay'].dt.month

    # Select important features for the model
    feature_cols = [
        'Age', 'Scholarship', 'Hipertension', 'Diabetes', 'Alcoholism',
        'Handcap', 'SMS_received', 'DaysAhead', 'DayOfWeek', 'IsWeekend', 'Month'
    ]

    X = df[feature_cols]
    y = df['No-show']
    
    # Save preprocessed data
    X.to_csv("data/X.csv", index=False)
    y.to_csv("data/y.csv", index=False)
    
    print("✅ Preprocessing completed successfully!")
    print(f"Total records: {len(X)}")
    print(f"No-show rate: {y.mean():.2%}")
    print(f"Features saved: {X.shape[1]} columns")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="data/KaggleV2-May-2016.csv", help="Path to the source no-show CSV")
    args = parser.parse_args()
    preprocess_data(args.input)