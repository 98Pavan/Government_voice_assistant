
from dotenv import load_dotenv
from lyzr import Studio

load_dotenv()

studio = Studio(log="debug")

agent = studio.create_agent(
    name="GovAssist Basic Test",
    provider="gpt-4o-mini",
    role="Helpful assistant",
    goal="Answer simple questions clearly",
    instructions="Reply briefly and helpfully."
)

response = agent.run("Reply with: Lyzr connection successful")
print("RESULT:", response.response)

