from flask import Flask
from flask_login import LoginManager
from pathlib import Path

app = Flask(__name__)
dbpath = Path(__file__).parent.parent / 'db.sqlite3'
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{dbpath.as_posix()}'

app.config['SECRET_KEY'] = '987c4248657574be7960f9e3bdb28b217f7614488555327bcd3af88687e3cd47'


from frydea.database import db
db.init_app(app)

# 导入定义的模型
import frydea.models
with app.app_context():
    db.create_all()

login_manager = LoginManager(app)
login_manager.init_app(app)

# 注册http路由函数
import frydea.views