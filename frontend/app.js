const API_BASE_URL = 'http://localhost:5000/api';

// All 28 states of India - displayed immediately in dropdown
const ALL_INDIA_STATES = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
    'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
    'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
    'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'
];

// Chart instances
let monthlyChart = null;
let yearlyChart = null;
let stateChart = null;
let historicalChart = null;
let seasonalChart = null;
let trendsChart = null;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    loadOverviewData();
    loadStates();
    setupPredictions();
});

// Tab switching
function setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(targetTab).classList.add('active');
            
            // Load data for active tab
            if (targetTab === 'overview') {
                loadOverviewData();
            } else if (targetTab === 'state-analysis') {
                loadStateAnalysis();
            } else if (targetTab === 'trends') {
                loadTrends();
            }
        });
    });
}

// Load overview data
async function loadOverviewData() {
    try {
        const response = await fetch(`${API_BASE_URL}/data/stats`);
        const stats = await response.json();
        
        document.getElementById('total-records').textContent = stats.total_records.toLocaleString();
        document.getElementById('avg-rainfall').textContent = `${stats.avg_rainfall.toFixed(2)} mm`;
        document.getElementById('max-rainfall').textContent = `${stats.max_rainfall.toFixed(2)} mm`;
        document.getElementById('states-count').textContent = stats.states.length;
        
        await loadMonthlyChart();
        await loadYearlyChart();
    } catch (error) {
        console.error('Error loading overview:', error);
        showError('Failed to load overview data');
    }
}

// Load monthly chart
async function loadMonthlyChart() {
    try {
        const response = await fetch(`${API_BASE_URL}/data/monthly`);
        const data = await response.json();
        
        // Aggregate by month across all states
        const monthlyAgg = {};
        data.forEach(item => {
            const key = `${item.year}-${item.month}`;
            if (!monthlyAgg[key]) {
                monthlyAgg[key] = { total: 0, count: 0 };
            }
            monthlyAgg[key].total += item.rainfall_mm;
            monthlyAgg[key].count++;
        });
        
        const labels = Object.keys(monthlyAgg).sort().slice(-12); // Last 12 months
        const values = labels.map(key => monthlyAgg[key].total / monthlyAgg[key].count);
        
        const ctx = document.getElementById('monthlyChart').getContext('2d');
        
        if (monthlyChart) {
            monthlyChart.destroy();
        }
        
        monthlyChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels.map(l => {
                    const [y, m] = l.split('-');
                    return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                }),
                datasets: [{
                    label: 'Average Rainfall (mm)',
                    data: values,
                    backgroundColor: 'rgba(37, 99, 235, 0.6)',
                    borderColor: 'rgba(37, 99, 235, 1)',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        display: true
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Rainfall (mm)'
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error loading monthly chart:', error);
    }
}

// Load yearly chart
async function loadYearlyChart() {
    try {
        const response = await fetch(`${API_BASE_URL}/data/yearly`);
        const data = await response.json();
        
        // Aggregate by year
        const yearlyAgg = {};
        data.forEach(item => {
            if (!yearlyAgg[item.year]) {
                yearlyAgg[item.year] = { total: 0, count: 0 };
            }
            yearlyAgg[item.year].total += item.total_rainfall;
            yearlyAgg[item.year].count++;
        });
        
        const labels = Object.keys(yearlyAgg).sort();
        const values = labels.map(year => yearlyAgg[year].total / yearlyAgg[year].count);
        
        const ctx = document.getElementById('yearlyChart').getContext('2d');
        
        if (yearlyChart) {
            yearlyChart.destroy();
        }
        
        yearlyChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Average Yearly Rainfall (mm)',
                    data: values,
                    borderColor: 'rgba(16, 185, 129, 1)',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        display: true
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Rainfall (mm)'
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error loading yearly chart:', error);
    }
}

// Load states dropdown - uses all Indian states, displays immediately
function loadStates() {
    const stateSelect = document.getElementById('state-select');
    const predictStateSelect = document.getElementById('predict-state');
    
    stateSelect.innerHTML = '<option value="">Select State</option>';
    predictStateSelect.innerHTML = '<option value="">Select State</option>';
    
    ALL_INDIA_STATES.forEach(state => {
        const option1 = document.createElement('option');
        option1.value = state;
        option1.textContent = state;
        stateSelect.appendChild(option1);
        
        const option2 = document.createElement('option');
        option2.value = state;
        option2.textContent = state;
        predictStateSelect.appendChild(option2);
    });
    
    stateSelect.addEventListener('change', (e) => {
        if (e.target.value) {
            loadStateData(e.target.value);
        }
    });
}

// Load state analysis
async function loadStateAnalysis() {
    const stateSelect = document.getElementById('state-select');
    if (stateSelect.value) {
        loadStateData(stateSelect.value);
    }
}

// Load data for specific state - displays immediately when selected
async function loadStateData(stateName) {
    try {
        const response = await fetch(`${API_BASE_URL}/data/state/${encodeURIComponent(stateName)}`);
        const data = await response.json();
        
        if (data.error) {
            showError(data.error);
            return;
        }
        
        document.getElementById('state-chart-title').textContent = `Monthly Rainfall - ${stateName}`;
        
        // State monthly chart
        const ctx = document.getElementById('stateChart').getContext('2d');
        const labels = data.monthly_data.map(d => `${d.year}-${String(d.month).padStart(2, '0')}`);
        const values = data.monthly_data.map(d => d.total);
        
        if (stateChart) {
            stateChart.destroy();
        }
        
        stateChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels.map(l => {
                    const [y, m] = l.split('-');
                    return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                }),
                datasets: [{
                    label: 'Monthly Rainfall (mm)',
                    data: values,
                    backgroundColor: 'rgba(245, 158, 11, 0.6)',
                    borderColor: 'rgba(245, 158, 11, 1)',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        display: true
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Rainfall (mm)'
                        }
                    }
                }
            }
        });
        
        // Historical yearly rainfall chart
        if (data.historical_yearly && data.historical_yearly.length > 0) {
            const histCtx = document.getElementById('historicalChart').getContext('2d');
            const histLabels = data.historical_yearly.map(d => d.year);
            const histValues = data.historical_yearly.map(d => d.total_rainfall);
            
            if (historicalChart) {
                historicalChart.destroy();
            }
            
            historicalChart = new Chart(histCtx, {
                type: 'line',
                data: {
                    labels: histLabels,
                    datasets: [{
                        label: 'Yearly Total Rainfall (mm)',
                        data: histValues,
                        borderColor: 'rgba(37, 99, 235, 1)',
                        backgroundColor: 'rgba(37, 99, 235, 0.1)',
                        borderWidth: 3,
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: { display: true }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: { display: true, text: 'Rainfall (mm)' }
                        }
                    }
                }
            });
        }
        
        // Load seasonal analysis
        await loadSeasonalChart(stateName);
    } catch (error) {
        console.error('Error loading state data:', error);
        showError('Failed to load state data');
    }
}

// Load seasonal chart
async function loadSeasonalChart(stateName) {
    try {
        const response = await fetch(`${API_BASE_URL}/analysis/seasonal`);
        const data = await response.json();
        
        const stateData = data.filter(d => d.state.toLowerCase() === stateName.toLowerCase());
        const seasons = ['Pre-Monsoon', 'Monsoon', 'Post-Monsoon', 'Winter'];
        const values = seasons.map(season => {
            const item = stateData.find(d => d.season === season);
            return item ? item.avg_rainfall : 0;
        });
        
        const ctx = document.getElementById('seasonalChart').getContext('2d');
        
        if (seasonalChart) {
            seasonalChart.destroy();
        }
        
        seasonalChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: seasons,
                datasets: [{
                    data: values,
                    backgroundColor: [
                        'rgba(37, 99, 235, 0.6)',
                        'rgba(16, 185, 129, 0.6)',
                        'rgba(245, 158, 11, 0.6)',
                        'rgba(239, 68, 68, 0.6)'
                    ],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error loading seasonal chart:', error);
    }
}

// Setup predictions
function setupPredictions() {
    document.getElementById('predict-btn').addEventListener('click', async () => {
        const state = document.getElementById('predict-state').value;
        const date = document.getElementById('predict-date').value;
        
        if (!state || !date) {
            alert('Please select both state and date');
            return;
        }
        
        try {
            const response = await fetch(`${API_BASE_URL}/predict`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ state, date })
            });
            
            const result = await response.json();
            
            if (response.ok) {
                const hasRainfall = result.rainfall_chance === 'yes';
                const resultDiv = document.getElementById('prediction-result');
                resultDiv.innerHTML = `
                    <h3>Prediction Result</h3>
                    <p><strong>State:</strong> ${result.state}</p>
                    <p><strong>Date:</strong> ${new Date(result.date).toLocaleDateString()}</p>
                    <div class="result-value">${result.predicted_rainfall_mm} mm</div>
                    <div class="rainfall-chance-visual ${hasRainfall ? 'rainfall-yes' : 'rainfall-no'}">
                        <span class="rainfall-icon">${hasRainfall ? '🌧️' : '☀️'}</span>
                        <p class="rainfall-message">${hasRainfall ? 'There are chances of rainfall.' : 'There are no chances of rainfall.'}</p>
                    </div>
                    <p><strong>Confidence:</strong> ${result.confidence}</p>
                `;
                resultDiv.classList.add('show');
            } else {
                showError(result.error || 'Prediction failed');
            }
        } catch (error) {
            console.error('Error making prediction:', error);
            showError('Failed to get prediction');
        }
    });
}

// Load trends
async function loadTrends() {
    try {
        const response = await fetch(`${API_BASE_URL}/analysis/trends`);
        const trends = await response.json();
        
        // Trends chart
        const ctx = document.getElementById('trendsChart').getContext('2d');
        const labels = trends.map(t => t.state);
        const values = trends.map(t => t.avg_yearly_rainfall);
        const colors = trends.map(t => t.trend === 'increasing' ? 'rgba(16, 185, 129, 0.6)' : 'rgba(239, 68, 68, 0.6)');
        
        if (trendsChart) {
            trendsChart.destroy();
        }
        
        trendsChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Average Yearly Rainfall (mm)',
                    data: values,
                    backgroundColor: colors,
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Rainfall (mm)'
                        }
                    }
                }
            }
        });
        
        // Trends table
        const tableDiv = document.getElementById('trends-table');
        let tableHTML = '<table><thead><tr><th>State</th><th>Trend</th><th>Slope</th><th>Avg Yearly Rainfall (mm)</th></tr></thead><tbody>';
        
        trends.forEach(trend => {
            const trendIcon = trend.trend === 'increasing' ? '📈' : '📉';
            tableHTML += `
                <tr>
                    <td>${trend.state}</td>
                    <td>${trendIcon} ${trend.trend}</td>
                    <td>${trend.slope.toFixed(2)}</td>
                    <td>${trend.avg_yearly_rainfall.toFixed(2)}</td>
                </tr>
            `;
        });
        
        tableHTML += '</tbody></table>';
        tableDiv.innerHTML = tableHTML;
    } catch (error) {
        console.error('Error loading trends:', error);
        showError('Failed to load trends');
    }
}

// Utility functions
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error';
    errorDiv.textContent = message;
    document.querySelector('.tab-content.active').prepend(errorDiv);
    
    setTimeout(() => {
        errorDiv.remove();
    }, 5000);
}
