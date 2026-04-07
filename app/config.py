import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SQLALCHEMY_DATABASE_URI = os.getenv(
        'DATABASE_URL',
        'mysql+pymysql://user:password@localhost:3306/ipam'
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key')
    DEBUG = os.getenv('FLASK_ENV', 'production') == 'development'

DB_CONFIG = {
    'user':     os.getenv('DB_USER',     'user'),
    'password': os.getenv('DB_PASSWORD', 'password'),
    'host':     os.getenv('DB_HOST',     'localhost'),
    'port':     3306,
    'database': os.getenv('DB_NAME',     'ipam')
}
