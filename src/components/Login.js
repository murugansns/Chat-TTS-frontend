import React, { useState } from 'react';
import './Login.css';

const Login = ({ onLogin }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: ''
  });
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');

    try {
      const endpoint = isLogin ? '/api/v1/auth/login' : '/api/v1/auth/register';
      const payload = isLogin
        ? { email: formData.email }
        : { name: formData.name, email: formData.email };

      const response = await fetch(`http://192.168.1.218:8000${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle 4xx/5xx responses
        throw new Error(data.detail || 'An error occurred during registration');
      }

      if (response.ok && data.access_token) {
        // Store token in localStorage
        localStorage.setItem('authToken', data.access_token);
        localStorage.setItem('user', JSON.stringify(data.user));

        // Call the onLogin callback
        onLogin(data.user, data.access_token);
      } else {
        setMessage(data.message || 'An error occurred');
      }
    } catch (error) {
      console.error('Authentication error:', error);
      setMessage(error.message || 'Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>Welcome to RAG Chatbot</h1>
          <p>Please {isLogin ? 'login' : 'register'} to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {!isLogin && (
            <div className="form-group">
              <label htmlFor="name">Full Name</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required={!isLogin}
                placeholder="Enter your full name"
                disabled={isLoading}
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              required
              placeholder="Enter your email address"
              disabled={isLoading}
            />
          </div>

          {message && (
            <div className={`message ${message.toLowerCase().includes('error') || message.includes('Network') ? 'error' : 'success'}`}>
              {message}
            </div>
          )}

          <button
            type="submit"
            className="login-button"
            disabled={isLoading}
          >
            {isLoading ? 'Please wait...' : (isLogin ? 'Login' : 'Register')}
          </button>
        </form>

        <div className="login-footer">
          <button
            type="button"
            className="toggle-mode"
            onClick={() => {
              setIsLogin(!isLogin);
              setMessage('');
              setFormData({ name: '', email: '' });
            }}
            disabled={isLoading}
          >
            {isLogin
              ? "Don't have an account? Register here"
              : "Already have an account? Login here"
            }
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
