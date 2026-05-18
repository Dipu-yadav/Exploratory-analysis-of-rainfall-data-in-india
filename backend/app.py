from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import json
import os
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
import joblib

app = Flask(__name__)
CORS(app)

# All 28 states of India
ALL_INDIA_STATES = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
    'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
    'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
    'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'
]

# Global variables for models and data
rainfall_model = None
scaler = None
rainfall_data = None

def load_rainfall_data():
    """Load or generate sample rainfall data with historical data for all Indian states"""
    global rainfall_data
    
    data_file = 'data/rainfall_data.csv'
    if os.path.exists(data_file):
        rainfall_data = pd.read_csv(data_file)
        # Ensure we have all states - regenerate if missing any
        existing_states = set(rainfall_data['state'].unique())
        if not all(s in existing_states for s in ALL_INDIA_STATES):
            rainfall_data = None  # Force regeneration below
    else:
        rainfall_data = None
    
    if rainfall_data is None:
        # Generate sample data with historical rainfall (2010-2024) for all Indian states
        np.random.seed(42)
        dates = pd.date_range(start='2020-01-01', end='2023-12-31', freq='ME')
        states = ALL_INDIA_STATES
        
        data = []
        for state in states:
            for date in dates:
                # Simulate seasonal patterns (monsoon: Jun-Sep)
                month = date.month
                if month in [6, 7, 8, 9]:  # Monsoon season
                    base_rainfall = np.random.normal(15, 5)
                elif month in [10, 11]:  # Post-monsoon
                    base_rainfall = np.random.normal(5, 2)
                elif month in [12, 1, 2]:  # Winter
                    base_rainfall = np.random.normal(2, 1)
                else:  # Pre-monsoon
                    base_rainfall = np.random.normal(3, 1.5)
                
                rainfall = max(0, base_rainfall)  # No negative rainfall
                
                data.append({
                    'date': date.strftime('%Y-%m-%d'),
                    'state': state,
                    'rainfall_mm': round(rainfall, 2),
                    'year': date.year,
                    'month': date.month,
                    'day': date.day
                })
        
        rainfall_data = pd.DataFrame(data)
        os.makedirs('data', exist_ok=True)
        rainfall_data.to_csv(data_file, index=False)
        # Remove old model so it gets retrained with new state data
        for f in ['models/rainfall_model.pkl', 'models/scaler.pkl']:
            if os.path.exists(f):
                os.remove(f)
    
    return rainfall_data

def train_model():
    """Train rainfall prediction model"""
    global rainfall_model, scaler
    
    if rainfall_data is None:
        load_rainfall_data()
    
    # Prepare features
    df = rainfall_data.copy()
    df['date'] = pd.to_datetime(df['date'])
    df['day_of_year'] = df['date'].dt.dayofyear
    df['month_sin'] = np.sin(2 * np.pi * df['month'] / 12)
    df['month_cos'] = np.cos(2 * np.pi * df['month'] / 12)
    
    # Encode states
    state_encoded = pd.get_dummies(df['state'], prefix='state')
    df = pd.concat([df, state_encoded], axis=1)
    
    # Features
    feature_cols = ['day_of_year', 'month_sin', 'month_cos', 'year'] + \
                   [col for col in df.columns if col.startswith('state_')]
    X = df[feature_cols]
    y = df['rainfall_mm']
    
    # Train model
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    
    rainfall_model = RandomForestRegressor(n_estimators=10, random_state=42, n_jobs=1)
    rainfall_model.fit(X_train_scaled, y_train)
    
    # Save model
    os.makedirs('models', exist_ok=True)
    joblib.dump(rainfall_model, 'models/rainfall_model.pkl')
    joblib.dump(scaler, 'models/scaler.pkl')
    
    return rainfall_model

def load_model():
    """Load trained model if exists"""
    global rainfall_model, scaler
    
    if os.path.exists('models/rainfall_model.pkl'):
        rainfall_model = joblib.load('models/rainfall_model.pkl')
        scaler = joblib.load('models/scaler.pkl')
    else:
        train_model()

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy', 'message': 'API is running'})

@app.route('/api/data/states', methods=['GET'])
def get_all_states():
    """Get all Indian states for dropdown"""
    return jsonify({'states': ALL_INDIA_STATES})

@app.route('/api/data/stats', methods=['GET'])
def get_stats():
    """Get overall statistics"""
    if rainfall_data is None:
        load_rainfall_data()
    
    stats = {
        'total_records': len(rainfall_data),
        'date_range': {
            'start': rainfall_data['date'].min(),
            'end': rainfall_data['date'].max()
        },
        'states': rainfall_data['state'].unique().tolist(),
        'avg_rainfall': float(rainfall_data['rainfall_mm'].mean()),
        'max_rainfall': float(rainfall_data['rainfall_mm'].max()),
        'min_rainfall': float(rainfall_data['rainfall_mm'].min())
    }
    
    return jsonify(stats)

@app.route('/api/data/state/<state_name>', methods=['GET'])
def get_state_data(state_name):
    """Get data for a specific state"""
    if rainfall_data is None:
        load_rainfall_data()
    
    state_df = rainfall_data[rainfall_data['state'].str.lower() == state_name.lower()]
    
    if state_df.empty:
        return jsonify({'error': 'State not found'}), 404
    
    # Monthly aggregation (use explicit year/month columns to avoid duplicate 'date' on reset_index)
    state_df = state_df.copy()
    state_df['date'] = pd.to_datetime(state_df['date'])
    state_df['_year'] = state_df['date'].dt.year
    state_df['_month'] = state_df['date'].dt.month
    monthly = state_df.groupby(['_year', '_month']).agg({
        'rainfall_mm': ['sum', 'mean', 'max', 'min']
    }).reset_index()
    monthly.columns = ['year', 'month', 'total', 'avg', 'max', 'min']
    monthly['date'] = pd.to_datetime(monthly[['year', 'month']].assign(day=1))
    
    # Historical yearly rainfall data (previous years for pattern analysis)
    yearly_historical = state_df.groupby('_year').agg({
        'rainfall_mm': ['sum', 'mean']
    }).reset_index()
    yearly_historical.columns = ['year', 'total_rainfall', 'avg_rainfall']
    
    result = {
        'state': state_name,
        'monthly_data': monthly.to_dict('records'),
        'historical_yearly': yearly_historical.to_dict('records'),
        'yearly_avg': float(state_df['rainfall_mm'].mean()),
        'yearly_total': float(state_df.groupby('_year')['rainfall_mm'].sum().mean())
    }
    
    return jsonify(result)

@app.route('/api/data/monthly', methods=['GET'])
def get_monthly_data():
    """Get monthly aggregated data"""
    if rainfall_data is None:
        load_rainfall_data()
    
    df = rainfall_data.copy()
    df['date'] = pd.to_datetime(df['date'])
    df['_year'] = df['date'].dt.year
    df['_month'] = df['date'].dt.month
    
    monthly = df.groupby(['_year', '_month', 'state']).agg({
        'rainfall_mm': 'sum'
    }).reset_index()
    
    monthly.columns = ['year', 'month', 'state', 'rainfall_mm']
    monthly['date'] = pd.to_datetime(monthly[['year', 'month']].assign(day=1))
    
    return jsonify(monthly.to_dict('records'))

@app.route('/api/data/yearly', methods=['GET'])
def get_yearly_data():
    """Get yearly aggregated data"""
    if rainfall_data is None:
        load_rainfall_data()
    
    df = rainfall_data.copy()
    df['date'] = pd.to_datetime(df['date'])
    df['_year'] = df['date'].dt.year
    
    yearly = df.groupby(['_year', 'state']).agg({
        'rainfall_mm': ['sum', 'mean']
    }).reset_index()
    
    yearly.columns = ['year', 'state', 'total_rainfall', 'avg_rainfall']
    
    return jsonify(yearly.to_dict('records'))

@app.route('/api/predict', methods=['POST'])
def predict():
    """Predict rainfall for given date and state"""
    if rainfall_model is None:
        load_model()
    
    data = request.json
    state = data.get('state')
    date_str = data.get('date')
    
    if not state or not date_str:
        return jsonify({'error': 'State and date are required'}), 400
    
    try:
        date = pd.to_datetime(date_str)
        day_of_year = date.dayofyear
        month = date.month
        year = date.year
        
        month_sin = np.sin(2 * np.pi * month / 12)
        month_cos = np.cos(2 * np.pi * month / 12)
        
        # Get state encoding
        if rainfall_data is None:
            load_rainfall_data()
        
        states = rainfall_data['state'].unique()
        state_encoded = {s: 1 if s.lower() == state.lower() else 0 for s in states}
        
        # Build feature vector
        features = [day_of_year, month_sin, month_cos, year]
        features.extend([state_encoded.get(s, 0) for s in sorted(states)])
        
        # Scale and predict (model uses historical patterns for prediction)
        features_scaled = scaler.transform([features])
        prediction = rainfall_model.predict(features_scaled)[0]
        predicted_mm = round(max(0, prediction), 2)
        
        # Determine rainfall chance from state-wise and month-wise historical data
        state_month_mask = (
            (rainfall_data['state'].str.lower() == state.lower()) &
            (rainfall_data['month'] == month)
        )
        state_month_historical = rainfall_data.loc[state_month_mask, 'rainfall_mm']
        if len(state_month_historical) == 0:
            historical_avg_daily = 0.0
        else:
            historical_avg_daily = float(state_month_historical.mean())
        # Dry state-months: historical avg daily rainfall below threshold -> no chances
        RAIN_THRESHOLD_MM_PER_DAY = 2.5
        rainfall_chance = 'yes' if historical_avg_daily >= RAIN_THRESHOLD_MM_PER_DAY else 'no'
        
        return jsonify({
            'state': state,
            'date': date_str,
            'predicted_rainfall_mm': predicted_mm,
            'rainfall_chance': rainfall_chance,
            'confidence': 'moderate'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/analysis/trends', methods=['GET'])
def get_trends():
    """Analyze rainfall trends"""
    if rainfall_data is None:
        load_rainfall_data()
    
    df = rainfall_data.copy()
    df['date'] = pd.to_datetime(df['date'])
    df['_year'] = df['date'].dt.year
    
    # Yearly trends
    yearly_trends = df.groupby(['_year', 'state'])['rainfall_mm'].sum().reset_index()
    yearly_trends.columns = ['year', 'state', 'total_rainfall']
    
    # Calculate trend (slope) for each state
    trends = []
    for state in yearly_trends['state'].unique():
        state_data = yearly_trends[yearly_trends['state'] == state].sort_values('year')
        years = state_data['year'].values
        rainfall = state_data['total_rainfall'].values
        
        if len(years) > 1:
            slope = np.polyfit(years, rainfall, 1)[0]
            trend_direction = 'increasing' if slope > 0 else 'decreasing'
            trends.append({
                'state': state,
                'trend': trend_direction,
                'slope': float(slope),
                'avg_yearly_rainfall': float(rainfall.mean())
            })
    
    return jsonify(trends)

@app.route('/api/analysis/seasonal', methods=['GET'])
def get_seasonal_analysis():
    """Analyze seasonal patterns"""
    if rainfall_data is None:
        load_rainfall_data()
    
    df = rainfall_data.copy()
    df['date'] = pd.to_datetime(df['date'])
    df['season'] = df['date'].dt.month.apply(lambda m: 
        'Monsoon' if m in [6,7,8,9] else 
        'Post-Monsoon' if m in [10,11] else 
        'Winter' if m in [12,1,2] else 'Pre-Monsoon')
    
    seasonal = df.groupby(['state', 'season'])['rainfall_mm'].mean().reset_index()
    seasonal.columns = ['state', 'season', 'avg_rainfall']
    
    return jsonify(seasonal.to_dict('records'))

# if __name__ == '__main__':
#     print("Loading rainfall data...")
#     load_rainfall_data()
#     print("Training/loading model...")
#     load_model()
#     print("Starting Flask server...")
#     app.run(debug=True, port=5000)

print("Loading rainfall data...")
load_rainfall_data()
print("Training/loading model...")
load_model()
print("Flask server ready...")

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=False, host='0.0.0.0', port=port)