import { ReactMarkdown } from "react-markdown/lib/react-markdown";
import styled, { createGlobalStyle } from "styled-components";
import aboutMd from "../../resources/about.md";

export function AboutScreen() {
  return (
    <Container>
      <GlobalStyle />
      <ContentContainer>
        <ReactMarkdown>{aboutMd}</ReactMarkdown>
      </ContentContainer>
    </Container>
  );
}

const GlobalStyle = createGlobalStyle`
  html {
    background-color: white;
    color: black;
  }
`;

const Container = styled.div`
  display: flex;
  justify-content: flex-start;
  align-items: center;
  flex-direction: column;
  width: 100vw;
  margin: 0;
`;

const ContentContainer = styled.div`
  flex-grow: 0;
  width: 600px;
  max-width: 600px;
  min-height: 100vh;
  padding: 64px 32px;
  box-sizing: border-box;

  .content-container ol,
  .content-container ul {
    padding-left: 30px;
  }

  @media (max-device-width: 600px) {
    .content-container ol,
    .content-container ul {
      padding-left: 20px;
    }

    .content-container {
      padding: 12px 12px;
      padding-bottom: 64px;
      width: 100%;
    }
  }
`;
