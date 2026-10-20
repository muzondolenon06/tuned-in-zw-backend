import os
import json
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

class AIService:
    def __init__(self):
        self.api_key = os.environ.get("GOOGLE_API_KEY")
        self.model_name = "gemini-2.0-flash"
        self.client = None
        if self.api_key:
            try:
                self.client = genai.Client(api_key=self.api_key)
            except Exception as e:
                print(f"Failed to initialize Gemini client: {e}")
                self.client = None
        else:
            print("GOOGLE_API_KEY not set. AIService running in simulated fallback mode.")

    def _call_api(self, prompt: str, json_mode: bool = False) -> str:
        if not self.client:
            raise ValueError("GOOGLE_API_KEY is not configured")
        config = types.GenerateContentConfig()
        if json_mode:
            config.response_mime_type = "application/json"
            
        try:
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=prompt,
                config=config
            )
            return response.text
        except Exception as e:
            raise ValueError(f"API Error: {e}")

    def summarize_article(self, content: str) -> str:
        prompt = f"Summarize the following news article into a short, unbiased paragraph:\n\n{content}"
        try:
            return self._call_api(prompt).strip()
        except Exception as e:
            print(f"Error summarizing: {e}")
            return "Summary unavailable."

    def categorize_article(self, title: str, summary: str) -> dict:
        prompt = f"""
        Analyze this news article:
        Title: {title}
        Summary: {summary}
        
        Provide:
        1. A general category (e.g., sports, entertainment, governance, finance, policy, education, health).
        2. A short descriptive topic identifier (e.g., CAB3, Land Reform, Election 2028).
        
        Output strictly in JSON format: {{"category": "value", "descriptive_topic": "value"}}
        """
        try:
            text = self._call_api(prompt, json_mode=True)
            text = text.replace('```json', '').replace('```', '').strip()
            return json.loads(text)
        except Exception as e:
            print(f"Error categorizing: {e}")
            return {"category": "General", "descriptive_topic": "General News"}

    def deduplicate_headlines(self, new_headline: str, existing_headlines: list[str]) -> bool:
        if not existing_headlines:
            return False
            
        existing_list = "\n".join([f"- {h}" for h in existing_headlines])
        prompt = f"""
        New Headline: {new_headline}
        
        Existing Headlines:
        {existing_list}
        
        Is the new headline reporting on the exact same specific event as any of the existing headlines?
        Respond with exactly 'YES' or 'NO'.
        """
        try:
            text = self._call_api(prompt)
            return "YES" in text.upper()
        except Exception as e:
            return False

    def generate_deep_summary(self, content: str) -> dict:
        prompt = f"""
        Analyze the following article and provide a deep, structured summary.
        CRITICAL RULE FOR STATISTICS: You MUST NOT invent or hallucinate any statistics. You must only extract statistics that are explicitly present in the provided text, and specifically note if they are from ZIMSTAT or official informative productions. If there are no statistics, leave the facts section empty.
        
        Provide the output strictly in JSON format with the following keys:
        - "overview": A detailed description of the topic.
        - "facts": A list of strings, containing facts and statistics (only those from the text).
        - "verdict": A non-biased conclusion based solely on the information retrieved.
        
        Article Content:
        {content}
        """
        try:
            text = self._call_api(prompt, json_mode=True)
            text = text.replace('```json', '').replace('```', '').strip()
            return json.loads(text)
        except Exception as e:
            print(f"Error generating deep summary: {e}")
            return {"overview": "Deep summary unavailable.", "facts": [], "verdict": "Unavailable"}

    def generate_live_suggestions(self, keyword: str) -> list[str]:
        prompt = f"""
        A user searched for '{keyword}' on our Zimbabwean news and governance platform, but we found no direct matches in our database.
        Act as a live scouting agent. Based on your knowledge of current affairs, politics, policy, legislation, sports, and community development in Zimbabwe, suggest 5 relevant topics that the user might be interested in researching.
        
        Provide the output strictly as a JSON list of strings.
        Example: ["New Lithium Mining Regulations", "Education Policy Updates", "Recent Healthcare Developments"]
        """
        try:
            text = self._call_api(prompt, json_mode=True)
            text = text.replace('```json', '').replace('```', '').strip()
            return json.loads(text)
        except Exception as e:
            print(f"Error generating live suggestions: {e}")
            return [f"General news related to {keyword}", f"Policy updates regarding {keyword}"]
